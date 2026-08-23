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


def test_identical_title_matches_legacy_row_despite_schedule_drift() -> None:
    # Observed in production: RA moved the end time 07:00 -> 08:00 and the start
    # time 12:00 -> 15:00 between two scrapes, which used to create duplicates.
    legacy = {"event_name": "silikon", "time_start": "23:00:00", "time_end": "07:00:00"}
    current = {"event_name": "silikon", "time_start": "23:00", "time_end": "08:00"}
    assert _same_legacy_ra_event(legacy, current)

    legacy = {"event_name": "Remain In Love", "time_start": "12:00:00", "time_end": "06:00:00"}
    current = {"event_name": "Remain In Love", "time_start": "15:00", "time_end": "08:00"}
    assert _same_legacy_ra_event(legacy, current)


def test_similar_title_with_different_start_is_not_merged() -> None:
    legacy = {"event_name": "Klubnacht", "time_start": "12:00", "time_end": "22:00"}
    current = {"event_name": "Klubnacht - Late Edition", "time_start": "23:00", "time_end": "06:00"}
    assert not _same_legacy_ra_event(legacy, current)


def test_similar_title_ignores_end_time_drift() -> None:
    legacy = {"event_name": "Katernacht", "time_start": "23:00:00", "time_end": "06:00:00"}
    current = {"event_name": "Katernacht with Reflex Blue, Frinda di Lanco", "time_start": "23:00", "time_end": "08:00"}
    assert _same_legacy_ra_event(legacy, current)


class _FakeEventsQuery:
    def __init__(self, rows: list[dict], deactivated: list[int]) -> None:
        self._rows = rows
        self._deactivated = deactivated
        self._update_payload: dict | None = None
        self._ids: list[int] | None = None

    def select(self, *_args, **_kwargs) -> "_FakeEventsQuery":
        return self

    def eq(self, *_args, **_kwargs) -> "_FakeEventsQuery":
        return self

    def update(self, payload: dict) -> "_FakeEventsQuery":
        self._update_payload = payload
        return self

    def in_(self, _column: str, ids: list[int]) -> "_FakeEventsQuery":
        self._ids = list(ids)
        return self

    def execute(self):
        if self._update_payload is not None:
            assert self._update_payload == {"is_active": False}
            self._deactivated.extend(self._ids or [])
            return None

        class Result:
            data = self._rows

        return Result()


class _FakeSupabase:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.deactivated: list[int] = []

    def table(self, name: str) -> _FakeEventsQuery:
        assert name == "events"
        return _FakeEventsQuery(self.rows, self.deactivated)


def test_complete_snapshot_deactivates_untouched_rows_in_window() -> None:
    from backend.database.supabase_seed_lineup import _deactivate_missing_ra_events

    supabase = _FakeSupabase([
        # Touched by the snapshot: stays active.
        {"id": 1, "ra_id": "100", "event_date": "2026-09-05", "event_end_date": "2026-09-06", "is_active": True},
        # RA event that disappeared from the listing.
        {"id": 2, "ra_id": "200", "event_date": "2026-09-12", "event_end_date": "2026-09-12", "is_active": True},
        # Legacy duplicate without ra_id inside the window.
        {"id": 3, "ra_id": None, "event_date": "2026-09-05", "event_end_date": "2026-09-05", "is_active": True},
        # Legacy row outside the window: untouched.
        {"id": 4, "ra_id": None, "event_date": "2026-12-24", "event_end_date": "2026-12-24", "is_active": True},
        # Already inactive: not updated again.
        {"id": 5, "ra_id": None, "event_date": "2026-09-05", "event_end_date": "2026-09-05", "is_active": False},
        # Multi-day legacy event that started before the window but still overlaps it.
        {"id": 6, "ra_id": "", "event_date": "2026-08-20", "event_end_date": "2026-08-24", "is_active": True},
    ])
    source_sync = {
        "source": "ra",
        "complete": True,
        "window_start": "2026-08-23",
        "window_end": "2026-10-31",
    }

    count = _deactivate_missing_ra_events(supabase, 7, source_sync, {"100"})

    assert count == 3
    assert sorted(supabase.deactivated) == [2, 3, 6]


def test_incomplete_snapshot_never_deactivates() -> None:
    from backend.database.supabase_seed_lineup import _deactivate_missing_ra_events

    supabase = _FakeSupabase([
        {"id": 3, "ra_id": None, "event_date": "2026-09-05", "event_end_date": "2026-09-05", "is_active": True},
    ])
    source_sync = {"source": "ra", "complete": False, "window_start": "2026-08-23", "window_end": "2026-10-31"}

    assert _deactivate_missing_ra_events(supabase, 7, source_sync, set()) == 0
    assert supabase.deactivated == []
