from backend.database.supabase_seed_lineup import (
    _normalize_act_name,
    _same_legacy_ra_event,
    _upsert_event_acts,
)


def test_act_name_normalization_matches_database_identity() -> None:
    assert _normalize_act_name("  TBA  ") == "tba"


def test_event_acts_are_upserted_in_one_batch() -> None:
    class FakeQuery:
        def __init__(self) -> None:
            self.calls: list[tuple[list[dict], str]] = []

        def upsert(self, rows: list[dict], *, on_conflict: str) -> "FakeQuery":
            self.calls.append((rows, on_conflict))
            return self

        def execute(self) -> None:
            return None

    class FakeSupabase:
        def __init__(self) -> None:
            self.query = FakeQuery()

        def table(self, name: str) -> FakeQuery:
            assert name == "event_acts"
            return self.query

    rows = [
        {"event_id": 7, "act_id": 11, "start_time": None, "end_time": None, "sort_order": 1},
        {"event_id": 7, "act_id": 12, "start_time": "23:00", "end_time": None, "sort_order": 2},
    ]
    supabase = FakeSupabase()

    _upsert_event_acts(supabase, rows)

    assert supabase.query.calls == [(rows, "event_id,act_id")]


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
