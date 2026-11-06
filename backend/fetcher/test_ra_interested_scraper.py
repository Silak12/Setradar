from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.fetcher import ra_interested_scraper
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


def _deactivation_fixture() -> tuple[list[dict], list[dict]]:
    clubs = [
        {"id": 1, "name": "Lokschuppen", "cities": {"name": "Berlin"}},
        {"id": 2, "name": "Tresor", "cities": {"name": "Berlin"}},
    ]
    events = [
        # Still listed on RA -> keep.
        {"id": 10, "club_id": 1, "event_date": "2026-09-05", "event_name": "MILLIAMPERE", "ra_id": "2215896", "is_active": True},
        # Cancelled / unpublished on RA -> deactivate.
        {"id": 11, "club_id": 1, "event_date": "2026-09-06", "event_name": "BOILER ROOM SETUP", "ra_id": "2496761", "is_active": True},
        # Already inactive -> untouched.
        {"id": 12, "club_id": 1, "event_date": "2026-09-06", "event_name": "Euphorik", "ra_id": "2516525", "is_active": False},
        # Legacy row without ra_id -> weekly snapshot handles it.
        {"id": 13, "club_id": 1, "event_date": "2026-09-06", "event_name": "KDW", "ra_id": None, "is_active": True},
        # Outside the window -> keep.
        {"id": 14, "club_id": 1, "event_date": "2026-11-01", "event_name": "Far away", "ra_id": "999", "is_active": True},
        # Venue whose RA listing failed -> keep.
        {"id": 20, "club_id": 2, "event_date": "2026-09-06", "event_name": "Tresor night", "ra_id": "555", "is_active": True},
    ]
    return clubs, events


def test_build_deactivations_flags_only_delisted_active_rows_in_window() -> None:
    from backend.fetcher.ra_interested_scraper import build_deactivations

    clubs, events = _deactivation_fixture()
    listings = [
        {"city": "Berlin", "club": "Lokschuppen", "listed_ra_ids": {"2215896"}},
        {"city": "Berlin", "club": "Tresor", "listed_ra_ids": None},
    ]

    stale = build_deactivations(
        listings,
        clubs,
        events,
        today=date(2026, 9, 5),
        cutoff=date(2026, 10, 3),
    )

    assert [item["id"] for item in stale] == [11]
    assert stale[0]["ra_id"] == "2496761"


def test_build_deactivations_without_listings_changes_nothing() -> None:
    from backend.fetcher.ra_interested_scraper import build_deactivations

    clubs, events = _deactivation_fixture()

    assert build_deactivations([], clubs, events, today=date(2026, 9, 5), cutoff=date(2026, 10, 3)) == []


def test_build_deactivations_trusts_empty_venue_listing() -> None:
    from backend.fetcher.ra_interested_scraper import build_deactivations

    clubs, events = _deactivation_fixture()
    listings = [{"city": "Berlin", "club": "Lokschuppen", "listed_ra_ids": set()}]

    stale = build_deactivations(listings, clubs, events, today=date(2026, 9, 5), cutoff=date(2026, 10, 3))

    assert sorted(item["id"] for item in stale) == [10, 11]


def test_incomplete_listing_prevents_database_changes(monkeypatch) -> None:
    monkeypatch.setattr(
        ra_interested_scraper, "fetch_venue_listing", Mock(side_effect=RuntimeError("RA unavailable"))
    )
    venues = [{"city": "Berlin", "club": "Lokschuppen", "venue_id": 17071}]

    with pytest.raises(RuntimeError, match="keine DB-Aenderungen"):
        ra_interested_scraper.scrape_venues(venues)


@pytest.mark.parametrize("dry_run", [True, False])
def test_database_dry_run_reports_updates_without_writing(dry_run) -> None:
    today = date.today().isoformat()
    supabase = Mock()
    clubs = [{"id": 1, "name": "Lokschuppen", "cities": {"name": "Berlin"}}]
    events = [
        {"id": 10, "club_id": 1, "event_date": today, "event_name": "Listed", "ra_id": "100"},
        {"id": 11, "club_id": 1, "event_date": today, "event_name": "Delisted", "ra_id": "101"},
    ]
    supabase.table.return_value.select.return_value.execute.return_value = SimpleNamespace(data=clubs)
    supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.execute.return_value = SimpleNamespace(data=events)
    supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=events[:1])
    scraped = [{
        "city": "Berlin", "club": "Lokschuppen", "event_date": today,
        "event_name": "Listed", "ra_id": "100", "interested_count": 25,
    }]
    listings = [{"city": "Berlin", "club": "Lokschuppen", "listed_ra_ids": {"100"}}]

    assert ra_interested_scraper.update_database(supabase, scraped, listings, dry_run=dry_run) == (1, 1)

    if dry_run:
        supabase.table.return_value.update.assert_not_called()
    else:
        assert supabase.table.return_value.update.call_count == 2


def test_dry_run_does_not_seed_hype(monkeypatch) -> None:
    monkeypatch.setattr(ra_interested_scraper.sys, "argv", ["ra_interested_scraper", "--dry-run"])
    monkeypatch.setattr(ra_interested_scraper, "load_venues_config", lambda: [])
    monkeypatch.setattr(ra_interested_scraper, "scrape_venues", lambda _: ([], []))
    monkeypatch.setattr(ra_interested_scraper, "_supabase_client", Mock())
    update = Mock(return_value=(0, 0))
    hype = Mock()
    monkeypatch.setattr(ra_interested_scraper, "update_database", update)
    monkeypatch.setattr(ra_interested_scraper, "seed_upcoming_hype", hype)

    ra_interested_scraper.main()

    assert update.call_args.kwargs == {"dry_run": True}
    hype.assert_not_called()
