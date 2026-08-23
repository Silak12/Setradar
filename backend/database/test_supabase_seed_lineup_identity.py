from backend.database.supabase_seed_lineup import _same_legacy_ra_event


def test_changed_ra_title_matches_legacy_row_with_same_schedule() -> None:
    legacy = {
        "event_name": "OST Klubnacht",
        "time_start": "23:00:00",
        "time_end": "06:00:00",
    }
    current = {
        "event_name": "OST Klubnacht - Katy Rough ANL",
        "time_start": "23:00",
        "time_end": "06:00",
    }

    assert _same_legacy_ra_event(legacy, current)


def test_parallel_events_with_different_names_are_not_merged() -> None:
    first = {
        "event_name": "Afternoon Open Air",
        "time_start": "14:00",
        "time_end": "22:00",
    }
    second = {
        "event_name": "Klubnacht",
        "time_start": "23:00",
        "time_end": "06:00",
    }

    assert not _same_legacy_ra_event(first, second)
