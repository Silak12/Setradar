from unittest.mock import Mock

import pytest

from backend.fetcher import ra_client


def _events(count: int) -> list[dict]:
    return [{"id": str(index), "date": "2026-11-06T00:00:00.000"} for index in range(1, count + 1)]


def _response(events: object) -> dict:
    return {"data": {"venue": {"events": events}}}


def test_listing_expands_limit_for_lokschuppen_regression(monkeypatch) -> None:
    request = Mock(side_effect=[_response(_events(100)), _response(_events(114))])
    monkeypatch.setattr(ra_client, "gql", request)
    monkeypatch.setattr(ra_client.time, "sleep", lambda _: None)

    events = ra_client.fetch_venue_listing("query", 17071)

    assert len(events) == 114
    assert [call.args[1]["limit"] for call in request.call_args_list] == [100, 200]
    assert events[-1]["id"] == "114"


@pytest.mark.parametrize("events", [[], {"data": []}])
def test_listing_accepts_explicit_empty_list(monkeypatch, events) -> None:
    monkeypatch.setattr(ra_client, "gql", lambda *args: _response(events))
    assert ra_client.fetch_venue_listing("query", 1) == []


@pytest.mark.parametrize("response", [
    {},
    {"data": {"venue": None}},
    {"data": {"venue": {}}},
    _response(None),
    _response({}),
    {**_response([]), "errors": [{"message": "Partial response"}]},
    _response([None]),
    _response([{"date": "2026-11-06"}]),
    _response([{"id": "1", "date": "invalid"}]),
])
def test_listing_rejects_incomplete_snapshot_before_deactivation(monkeypatch, response) -> None:
    monkeypatch.setattr(ra_client, "gql", lambda *args: response)
    with pytest.raises(RuntimeError):
        ra_client.fetch_venue_listing("query", 1)


def test_listing_fails_when_safety_limit_is_still_full(monkeypatch) -> None:
    request = Mock(side_effect=[_response(_events(2)), _response(_events(4))])
    monkeypatch.setattr(ra_client, "gql", request)
    monkeypatch.setattr(ra_client.time, "sleep", lambda _: None)

    with pytest.raises(RuntimeError, match="unvollstaendig"):
        ra_client.fetch_venue_listing("query", 1, initial_limit=2, max_limit=4)
    assert request.call_count == 2


def test_listing_rejects_failed_retry_instead_of_using_first_page(monkeypatch) -> None:
    request = Mock(side_effect=[_response(_events(100)), {}])
    monkeypatch.setattr(ra_client, "gql", request)
    monkeypatch.setattr(ra_client.time, "sleep", lambda _: None)

    with pytest.raises(RuntimeError):
        ra_client.fetch_venue_listing("query", 1)
