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


def _lokschuppen(events: list[dict]) -> list[dict]:
    venues = [{"venue_id": 17071, "city": "Berlin", "club": "Lokschuppen"}]
    return build_lineup_json(venues, {17071: events})["cities"][0]["clubs"][0]["events"]


def test_artist_stub_listing_is_absorbed_by_official_listing() -> None:
    # Real RA data from 2026-08-29: the promoter's listing plus a promoter-less
    # stub "Euphorik" announcing only one of the same artists.
    official = {
        "id": "2331880",
        "title": "EUPHORIK x CYCLE pres. L.zwo, Noise Not War, DJ SPORTSCHUH, CARGO",
        "date": "2026-08-29T00:00:00.000",
        "startTime": "2026-08-29T22:00:00.000",
        "endTime": "2026-08-30T09:00:00.000",
        "interestedCount": 369,
        "promoters": [{"id": "9094", "name": "Lokschuppen Berlin"}],
        "artists": [{"name": n} for n in ["L.zwo", "CARGO (DE)", "Limoncello", "Noise Not War"]],
    }
    stub = {
        "id": "2516525",
        "title": "Euphorik",
        "date": "2026-08-29T00:00:00.000",
        "startTime": "2026-08-29T23:00:00.000",
        "endTime": "2026-08-30T06:00:00.000",
        "interestedCount": 1,
        "promoters": [],
        "artists": [],
        "lineup": "Limoncello",
    }

    events = _lokschuppen([stub, official])

    assert [event["ra_id"] for event in events] == ["2331880"]


def test_stub_with_related_title_is_absorbed_even_without_promoter_info() -> None:
    official = {
        "id": "1",
        "title": "wieder: BOILER ROOM SETUP + MARKETPLACE",
        "date": "2026-10-11T00:00:00.000",
        "startTime": "2026-10-11T21:00:00.000",
        "endTime": "2026-10-12T06:00:00.000",
        "interestedCount": 4,
        "artists": [{"name": "Resident"}],
    }
    duplicate = {**official, "id": "2", "startTime": "2026-10-11T23:00:00.000", "interestedCount": 3}

    events = _lokschuppen([official, duplicate])

    assert [event["ra_id"] for event in events] == ["1"]


def test_afterparty_with_shared_dj_is_kept() -> None:
    main = {
        "id": "1",
        "title": "Klubnacht",
        "date": "2026-09-05T00:00:00.000",
        "startTime": "2026-09-05T23:00:00.000",
        "endTime": "2026-09-06T08:00:00.000",
        "interestedCount": 300,
        "promoters": [{"id": "1", "name": "Club"}],
        "artists": [{"name": "DJ A"}, {"name": "DJ B"}, {"name": "DJ C"}],
    }
    # Same day, lineup subset, but it starts after the main event ends.
    afterparty = {
        "id": "2",
        "title": "Klubnacht Afterhour",
        "date": "2026-09-06T00:00:00.000",
        "startTime": "2026-09-06T09:00:00.000",
        "endTime": "2026-09-06T18:00:00.000",
        "interestedCount": 20,
        "promoters": [],
        "artists": [{"name": "DJ A"}],
    }
    # Parallel floor the same night: unrelated title and own lineup.
    parallel = {
        "id": "3",
        "title": "Garden Floor Open Air",
        "date": "2026-09-05T00:00:00.000",
        "startTime": "2026-09-05T16:00:00.000",
        "endTime": "2026-09-06T02:00:00.000",
        "interestedCount": 40,
        "promoters": [],
        "artists": [{"name": "DJ A"}, {"name": "DJ Z"}],
    }

    events = _lokschuppen([main, afterparty, parallel])

    assert sorted(event["ra_id"] for event in events) == ["1", "2", "3"]


def test_unlinked_lineup_acts_are_added_after_linked_artists() -> None:
    # Realer Auszug aus RA-Event 2510526 (HIVE FREE RAVE): unverlinkte Acts
    # stehen als Plaintext im lineup-Feld, Set-Deskriptoren haengen teils
    # ausserhalb des <artist>-Tags.
    from backend.fetcher.transform import event_to_acts

    event = {
        "artists": [{"name": "IGDA"}, {"name": "NOTMYTYPE (2)"}, {"name": "Rabe Rax"}],
        "lineup": (
            "IMPORTANT - THE EVENT WILL BE DIVIDED INTO 3 PARTS\n\n"
            "PART 2 - SATURDAY DAY - OPEN AIR 14:00 - 22:00\n\n"
            "You can secure 1 ticket per person, per part.\n\n"
            "Keep an eye on our Instagram to follow any updates on the capacity!\n\n"
            "SATURDAY DAY OPEN AIR\n"
            '<artist id="134793">IGDA</artist>\xa0(Schranz set)\n'
            "MANIL\n"
            "NOTMYTYPE(Bounce Set)\n"
            '<artist id="177897">Rabe Rax</artist>\xa0\n'
            "VATOZ LOCOZ (Live)\n"
        ),
    }

    names = [act["name"] for act in event_to_acts(event)]

    assert names == ["IGDA", "NOTMYTYPE (2)", "Rabe Rax", "MANIL", "VATOZ LOCOZ"]


def test_lineup_fallback_without_artists_keeps_tagged_and_plain_names() -> None:
    from backend.fetcher.transform import event_to_acts

    event = {
        "artists": [],
        "lineup": 'MAIN FLOOR\n<artist id="1">L.zwo</artist>\u2028B2B <artist id="2">DiscoDaisy</artist>\nThe Shredder',
    }

    names = [act["name"] for act in event_to_acts(event)]

    assert names == ["L.zwo", "DiscoDaisy", "The Shredder"]
