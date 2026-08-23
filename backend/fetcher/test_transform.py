from datetime import date

from backend.fetcher.transform import build_lineup_json


def test_build_lineup_keeps_parallel_events_and_deduplicates_only_same_ra_id() -> None:
    venues = [{"venue_id": 10, "city": "Berlin", "club": "Test Club"}]
    shared = {
        "date": "2026-08-23T00:00:00.000",
        "startTime": "2026-08-23T23:00:00.000",
        "endTime": "2026-08-24T06:00:00.000",
        "artists": [],
    }
    scraped = {
        10: [
            {**shared, "id": "100", "title": "First version"},
            {**shared, "id": "100", "title": "Current version"},
            {**shared, "id": "101", "title": "Parallel event"},
        ]
    }

    payload = build_lineup_json(
        venues,
        scraped,
        sync_start=date(2026, 8, 23),
        sync_end=date(2026, 9, 23),
    )
    club = payload["cities"][0]["clubs"][0]

    assert [event["ra_id"] for event in club["events"]] == ["100", "101"]
    assert club["events"][0]["name"] == "Current version"
    assert club["events"][0]["end_date"] == "2026-08-24"
    assert club["source_sync"]["complete"] is True


def test_build_lineup_preserves_multi_day_end_date() -> None:
    venues = [{"venue_id": 10, "city": "Berlin", "club": "Test Club"}]
    scraped = {
        10: [
            {
                "id": "200",
                "title": "Weekender",
                "date": "2026-08-21T00:00:00.000",
                "startTime": "2026-08-21T18:00:00.000",
                "endTime": "2026-08-23T09:00:00.000",
                "artists": [],
            }
        ]
    }

    event = build_lineup_json(venues, scraped)["cities"][0]["clubs"][0]["events"][0]

    assert event["date"] == "2026-08-21"
    assert event["end_date"] == "2026-08-23"


def test_build_lineup_uses_newer_ra_id_for_replacement_listing() -> None:
    venues = [{"venue_id": 10, "city": "Berlin", "club": "Test Club"}]
    schedule = {
        "date": "2026-08-26T00:00:00.000",
        "startTime": "2026-08-26T22:00:00.000",
        "endTime": "2026-08-27T06:00:00.000",
        "artists": [],
    }
    scraped = {
        10: [
            {**schedule, "id": "2483252", "title": "SYMBIOTIKKA at KitKat Club Berlin"},
            {**schedule, "id": "2508281", "title": "Symbiotikka"},
        ]
    }

    events = build_lineup_json(venues, scraped)["cities"][0]["clubs"][0]["events"]

    assert len(events) == 1
    assert events[0]["ra_id"] == "2508281"
    assert events[0]["name"] == "Symbiotikka"
