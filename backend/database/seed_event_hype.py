from __future__ import annotations

import os
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import Client, create_client

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
SEED_SOURCE = "ra_fake_v1"

load_dotenv(ROOT_ENV_FILE)


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _supabase_client() -> Client:
    supabase_url = _required_env("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or _required_env(
        "SUPABASE_ANON_KEY"
    )
    return create_client(supabase_url, supabase_key)


def _api_error(prefix: str, exc: APIError) -> RuntimeError:
    message = getattr(exc, "message", str(exc))
    code = getattr(exc, "code", "unknown")
    return RuntimeError(f"{prefix} (code: {code}): {message}")


def _load_upcoming_events(supabase: Client) -> list[dict]:
    today = date.today()
    max_date = today + timedelta(days=60)
    try:
        response = (
            supabase.table("events")
            .select("id,event_date")
            .gte("event_date", today.isoformat())
            .lte("event_date", max_date.isoformat())
            .order("event_date")
            .execute()
        )
    except APIError as exc:
        raise _api_error("Failed to load upcoming events", exc) from exc
    return response.data or []


def _load_event_act_counts(supabase: Client, event_ids: list[int]) -> Counter[int]:
    if not event_ids:
        return Counter()

    try:
        response = (
            supabase.table("event_acts")
            .select("event_id")
            .in_("event_id", event_ids)
            .execute()
        )
    except APIError as exc:
        raise _api_error("Failed to load event_acts rows", exc) from exc

    return Counter(int(row["event_id"]) for row in (response.data or []) if row.get("event_id") is not None)


def _base_seed(days_until: int) -> int:
    if days_until <= 1:
        return 70
    if days_until <= 3:
        return 50
    if days_until <= 7:
        return 35
    if days_until <= 14:
        return 20
    return 8


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _build_seed_rows(events: list[dict], act_counts: Counter[int]) -> list[dict]:
    today = date.today()
    rows: list[dict] = []

    for event in events:
        event_id = int(event["id"])
        event_date = date.fromisoformat(str(event["event_date"]))
        days_until = max(0, (event_date - today).days)
        act_count = int(act_counts.get(event_id, 0))

        seed_count = _clamp(
            _base_seed(days_until) + min(act_count, 8) * 4 + (event_id % 11),
            8,
            120,
        )

        rows.append(
            {
                "event_id": event_id,
                "seed_count": seed_count,
                "source": SEED_SOURCE,
            }
        )

    return rows


def _upsert_seed_rows(supabase: Client, rows: list[dict]) -> None:
    if not rows:
        print("No upcoming events found in the next 60 days.")
        return

    try:
        (
            supabase.table("event_hype_seed")
            .upsert(rows, on_conflict="event_id")
            .execute()
        )
    except APIError as exc:
        raise _api_error("Failed to upsert event_hype_seed rows", exc) from exc

    print(f"Upserted {len(rows)} event_hype_seed row(s) with source='{SEED_SOURCE}'.")


def main() -> None:
    try:
        supabase = _supabase_client()
        events = _load_upcoming_events(supabase)
        event_ids = [int(event["id"]) for event in events if event.get("id") is not None]
        act_counts = _load_event_act_counts(supabase, event_ids)
        rows = _build_seed_rows(events, act_counts)
        _upsert_seed_rows(supabase, rows)
    except (RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
