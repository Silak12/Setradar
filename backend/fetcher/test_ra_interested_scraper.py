from datetime import date

from backend.fetcher.ra_interested_scraper import build_event_updates


def test_build_event_updates_matches_city_club_date_and_title() -> None:
    scraped = [
        {
            "ra_id": "123",
            "city": "Berlin",
            "club": "Berghain",
            "event_date": date.today().isoformat(),
            "event_name": "Klubnacht",
            "interested_count": 273,
        }
    ]
    clubs = [
        {"id": 5, "name": "Berghain", "cities": {"name": "Berlin"}},
    ]
    events = [
        {
            "id": 42,
            "club_id": 5,
            "event_date": date.today().isoformat(),
            "event_name": "Klubnacht",
        }
    ]

    updates, unmatched = build_event_updates(scraped, clubs, events)

    assert unmatched == []
    assert updates == [
        {
            "id": 42,
            "club_id": 5,
            "event_date": date.today().isoformat(),
            "event_name": "Klubnacht",
            "interested_count": 273,
        }
    ]


def test_build_event_updates_uses_maximum_for_duplicate_ra_listing() -> None:
    base = {
        "city": "Berlin",
        "club": "ÆDEN",
        "event_date": "2026-08-12",
        "event_name": "Lilith",
    }
    scraped = [
        {**base, "ra_id": "1", "interested_count": 1},
        {**base, "ra_id": "2", "interested_count": 4},
    ]
    clubs = [{"id": 8, "name": "ÆDEN", "cities": {"name": "Berlin"}}]
    events = [
        {
            "id": 99,
            "club_id": 8,
            "event_date": "2026-08-12",
            "event_name": "Lilith",
        }
    ]

    updates, unmatched = build_event_updates(scraped, clubs, events)

    assert unmatched == []
    assert updates[0]["interested_count"] == 4


def test_build_event_updates_matches_ra_id_after_title_and_date_change() -> None:
    scraped = [
        {
            "ra_id": "2412345",
            "city": "Berlin",
            "club": "OST",
            "event_date": "2026-08-22",
            "event_name": "OST Klubnacht - New Lineup",
            "interested_count": 67,
        }
    ]
    clubs = [{"id": 3, "name": "OST", "cities": {"name": "Berlin"}}]
    events = [
        {
            "id": 1188,
            "club_id": 3,
            "event_date": "2026-08-21",
            "event_name": "OST Klubnacht",
            "ra_id": "2412345",
        }
    ]

    updates, unmatched = build_event_updates(scraped, clubs, events)

    assert unmatched == []
    assert updates[0]["id"] == 1188
    assert updates[0]["interested_count"] == 67
