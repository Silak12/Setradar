from datetime import date, timedelta
from unittest.mock import Mock

import pytest

from backend.fetcher import ra_scraper


def test_fetch_venue_events_keeps_ongoing_events_and_filters_future(monkeypatch) -> None:
    today = date.today()
    events = [
        {"id": "1", "date": (today - timedelta(days=1)).isoformat(),
         "endTime": (today + timedelta(days=1)).isoformat() + "T06:00:00"},
        {"id": "2", "date": (today - timedelta(days=2)).isoformat()},
        {"id": "3", "date": (today + timedelta(weeks=1)).isoformat()},
        {"id": "4", "date": (today + timedelta(weeks=1, days=1)).isoformat()},
    ]
    monkeypatch.setattr(ra_scraper, "fetch_venue_listing", lambda *args: events)

    assert [event["id"] for event in ra_scraper.fetch_venue_events(17071, 1)] == ["1", "3"]


def test_main_does_not_seed_or_write_snapshot_when_venue_fetch_fails(monkeypatch, tmp_path) -> None:
    output = tmp_path / "snapshot.json"
    monkeypatch.setattr(ra_scraper.sys, "argv", ["ra_scraper", "--output", str(output)])
    monkeypatch.setattr(ra_scraper, "load_venues_config", lambda: [
        {"city": "Berlin", "club": "Lokschuppen", "venue_id": 17071},
    ])
    monkeypatch.setattr(ra_scraper, "scrape_venue", Mock(side_effect=RuntimeError("incomplete")))
    seed = Mock()
    monkeypatch.setattr("subprocess.run", seed)

    with pytest.raises(RuntimeError, match="incomplete"):
        ra_scraper.main()

    assert not output.exists()
    seed.assert_not_called()
