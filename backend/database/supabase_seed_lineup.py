import argparse
import json
import os
import re
import time
import unicodedata
from difflib import SequenceMatcher
from functools import wraps
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import Client, create_client

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
FRONTEND_CONFIG_FILE = Path(__file__).resolve().parents[2] / "frontend" / "js" / "config.js"
DEFAULT_INPUT = Path(__file__).resolve().parents[1] / "fetcher" / "lineup_seed_example.json"
DEFAULT_SCHEMA_SQL = Path(__file__).with_name("lineup_init.sql")
RA_IDENTITY_MIGRATION_SQL = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20260823000000_ra_event_identity.sql"
)

load_dotenv(ROOT_ENV_FILE)


def _retry_transport(func):
    """Retry idempotent Supabase operations after transient HTTP failures."""
    @wraps(func)
    def wrapped(*args, **kwargs):
        last_error: httpx.TransportError | None = None
        for attempt in range(5):
            try:
                return func(*args, **kwargs)
            except httpx.TransportError as exc:
                last_error = exc
                if attempt == 4:
                    break
                delay = 2 ** attempt
                print(
                    f"[WARN] Supabase transport interrupted in {func.__name__}; "
                    f"retrying in {delay}s ({attempt + 1}/4)."
                )
                time.sleep(delay)
        raise RuntimeError(
            f"Supabase transport failed repeatedly in {func.__name__}: {last_error}"
        ) from last_error

    return wrapped


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return None


def _extract_js_config_value(source: str, key: str) -> str | None:
    pattern = rf"{re.escape(key)}\s*:\s*['\"]([^'\"]+)['\"]"
    match = re.search(pattern, source)
    if not match:
        return None
    value = match.group(1).strip()
    return value or None


def _frontend_supabase_config() -> tuple[str | None, str | None]:
    if not FRONTEND_CONFIG_FILE.exists():
        return None, None
    try:
        source = FRONTEND_CONFIG_FILE.read_text(encoding="utf-8")
    except OSError:
        return None, None

    supabase_url = _extract_js_config_value(source, "SUPABASE_URL")
    supabase_key = _extract_js_config_value(source, "SUPABASE_PUBLISHABLE_KEY")
    if not supabase_key:
        supabase_key = _extract_js_config_value(source, "SUPABASE_ANON")
    return supabase_url, supabase_key


def _supabase_client() -> Client:
    supabase_url = _first_env(
        "SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "VITE_SUPABASE_URL",
    )

    # Database imports are privileged backend writes. Never fall back to a
    # browser-safe publishable/anon key.
    supabase_key = _first_env(
        "SUPABASE_SECRET_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_KEY",
    )

    frontend_url, _ = _frontend_supabase_config()
    if not supabase_url and frontend_url:
        supabase_url = frontend_url
        print(f"[INFO] Using SUPABASE_URL from {FRONTEND_CONFIG_FILE}")
    if not supabase_url:
        raise ValueError(
            "Missing required environment variable: one of "
            "SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, VITE_SUPABASE_URL"
        )
    if not supabase_key:
        raise ValueError(
            "Missing required environment variable: one of "
            "SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY"
        )

    return create_client(supabase_url, supabase_key)


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ValueError(f"Input JSON not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or not isinstance(payload.get("cities"), list):
        raise ValueError("Input JSON must contain key 'cities' with a list value.")
    return payload


def _payload_interested_stats(payload: dict[str, Any]) -> tuple[int, int]:
    total_events = 0
    events_with_interested_key = 0
    for city in payload.get("cities", []):
        for club in city.get("clubs", []):
            for event in club.get("events", []):
                total_events += 1
                if isinstance(event, dict) and "interested_count" in event:
                    events_with_interested_key += 1
    return total_events, events_with_interested_key


def _api_error(prefix: str, exc: APIError) -> RuntimeError:
    message = getattr(exc, "message", str(exc))
    code = getattr(exc, "code", "unknown")
    return RuntimeError(f"{prefix} (code: {code}): {message}")


@_retry_transport
def _has_column(supabase: Client, table: str, column: str) -> bool:
    try:
        supabase.table(table).select(column).limit(1).execute()
        return True
    except APIError:
        return False


@_retry_transport
def _ensure_required_tables(supabase: Client) -> None:
    required_tables = ["cities", "clubs", "events", "acts", "event_acts"]
    missing_tables: list[str] = []

    for table_name in required_tables:
        try:
            supabase.table(table_name).select("id").limit(1).execute()
        except APIError as exc:
            code = getattr(exc, "code", "")
            if code == "PGRST205":
                missing_tables.append(table_name)
                continue
            raise _api_error(
                f"Table check failed for '{table_name}'",
                exc,
            ) from exc

    if missing_tables:
        missing = ", ".join(missing_tables)
        raise RuntimeError(
            "Supabase schema is missing required tables: "
            f"{missing}. Run SQL from '{DEFAULT_SCHEMA_SQL}' in the Supabase SQL Editor first."
        )

    try:
        (
            supabase.table("events")
            .select("time_start,time_end,event_end_date,ra_id,is_active")
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise RuntimeError(
            "Schema mismatch: RA identity columns on 'events' are missing. "
            f"Run SQL from '{RA_IDENTITY_MIGRATION_SQL}' in the Supabase SQL Editor to migrate."
        ) from exc

    try:
        supabase.table("event_acts").select("start_time,end_time").limit(1).execute()
    except APIError as exc:
        raise RuntimeError(
            "Schema mismatch: 'event_acts.start_time/end_time' fehlen. "
            f"Run SQL from '{DEFAULT_SCHEMA_SQL}' in the Supabase SQL Editor to migrate."
        ) from exc

    try:
        supabase.table("acts").select("insta_name").limit(1).execute()
    except APIError as exc:
        raise RuntimeError(
            "Schema mismatch: 'acts.insta_name' fehlt. "
            f"Run SQL from '{DEFAULT_SCHEMA_SQL}' in the Supabase SQL Editor to migrate."
        ) from exc


@_retry_transport
def _get_or_create_city_id(supabase: Client, city_name: str) -> int:
    try:
        found = (
            supabase.table("cities").select("id").eq("name", city_name).limit(1).execute()
        )
        if found.data:
            return int(found.data[0]["id"])

        created = supabase.table("cities").insert({"name": city_name}).execute()
        return int(created.data[0]["id"])
    except APIError as exc:
        raise _api_error(f"City upsert failed for '{city_name}'", exc) from exc


@_retry_transport
def _get_or_create_club_id(supabase: Client, city_id: int, club_name: str) -> int:
    try:
        found = (
            supabase.table("clubs")
            .select("id")
            .eq("city_id", city_id)
            .eq("name", club_name)
            .limit(1)
            .execute()
        )
        if found.data:
            return int(found.data[0]["id"])

        created = (
            supabase.table("clubs")
            .insert({"city_id": city_id, "name": club_name})
            .execute()
        )
        return int(created.data[0]["id"])
    except APIError as exc:
        raise _api_error(f"Club upsert failed for '{club_name}'", exc) from exc


def _normalize_event_name(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).split())


def _same_legacy_ra_event(candidate: dict[str, Any], incoming: dict[str, Any]) -> bool:
    """Conservatively identify pre-ra_id rows created by an older scraper run."""
    old_name = _normalize_event_name(candidate.get("event_name"))
    new_name = _normalize_event_name(incoming.get("event_name"))
    if not old_name or not new_name:
        return False

    for field in ("time_start", "time_end"):
        old_value = str(candidate.get(field) or "")[:5]
        new_value = str(incoming.get(field) or "")[:5]
        if old_value and new_value and old_value != new_value:
            return False

    if old_name == new_name:
        return True
    if min(len(old_name), len(new_name)) >= 8 and (
        old_name.startswith(new_name) or new_name.startswith(old_name)
    ):
        return True
    return SequenceMatcher(None, old_name, new_name).ratio() >= 0.78


@_retry_transport
def _get_or_create_event_id(
    supabase: Client,
    club_id: int,
    event_date: str,
    event_end_date: str | None,
    event_name: str,
    time_start: str | None,
    time_end: str | None,
    interested_count: int | None,
    supports_interested_count: bool,
    ra_id: str | None,
) -> tuple[int, list[int]]:
    try:
        incoming = {
            "event_name": event_name,
            "time_start": time_start,
            "time_end": time_end,
        }
        exact_ra = []
        if ra_id:
            exact_ra = (
                supabase.table("events")
                .select("id")
                .eq("ra_id", ra_id)
                .limit(1)
                .execute()
            ).data or []

        candidates = (
            supabase.table("events")
            .select("id,event_name,time_start,time_end,ra_id")
            .eq("club_id", club_id)
            .eq("event_date", event_date)
            .execute()
        ).data or []
        legacy_matches = [
            candidate
            for candidate in candidates
            if not candidate.get("ra_id")
            and _same_legacy_ra_event(candidate, incoming)
        ]

        matches = exact_ra or legacy_matches
        duplicate_ids: list[int] = []
        if matches:
            event_id = min(int(row["id"]) for row in matches)
            duplicate_ids = sorted({
                int(row["id"])
                for row in legacy_matches
                if int(row["id"]) != event_id
            })
            update_payload: dict[str, Any] = {
                "club_id": club_id,
                "event_date": event_date,
                "event_end_date": event_end_date or event_date,
                "event_name": event_name,
                "time_start": time_start,
                "time_end": time_end,
                "ra_id": ra_id,
                "is_active": True,
            }
            if supports_interested_count and interested_count is not None:
                update_payload["interested_count"] = interested_count
            (
                supabase.table("events")
                .update(update_payload)
                .eq("id", event_id)
                .execute()
            )
            return event_id, duplicate_ids

        create_payload: dict[str, Any] = {
            "club_id": club_id,
            "event_date": event_date,
            "event_end_date": event_end_date or event_date,
            "event_name": event_name,
            "time_start": time_start,
            "time_end": time_end,
            "ra_id": ra_id,
            "is_active": True,
        }
        if supports_interested_count:
            create_payload["interested_count"] = interested_count
        created = (
            supabase.table("events")
            .insert(create_payload)
            .execute()
        )
        return int(created.data[0]["id"]), []
    except APIError as exc:
        label = f"{event_date} / {event_name or '<no-name>'}"
        raise _api_error(f"Event upsert failed for '{label}'", exc) from exc


def _normalize_act_name(act_name: str) -> str:
    """Match the generated acts.name_normalized database expression."""
    return act_name.strip().lower()


@_retry_transport
def _get_or_create_act_id(
    supabase: Client,
    act_name: str,
    insta_name: str | None = None,
    soundcloud_url: str | None = None,
    supports_soundcloud_url: bool = False,
) -> int:
    try:
        found = (
            supabase.table("acts")
            .select("id,insta_name")
            .eq("name_normalized", _normalize_act_name(act_name))
            .limit(1)
            .execute()
        )
        if found.data:
            act_id = int(found.data[0]["id"])
            existing_insta = found.data[0].get("insta_name")
            update_payload: dict[str, Any] = {}
            if insta_name is not None and insta_name != existing_insta:
                update_payload["insta_name"] = insta_name
            if supports_soundcloud_url and soundcloud_url is not None:
                update_payload["soundcloud_url"] = soundcloud_url

            if update_payload:
                (
                    supabase.table("acts")
                    .update(update_payload)
                    .eq("id", act_id)
                    .execute()
                )
                refreshed = (
                    supabase.table("acts")
                    .select("insta_name,soundcloud_url")
                    .eq("id", act_id)
                    .limit(1)
                    .execute()
                )
                current_insta = refreshed.data[0].get("insta_name") if refreshed.data else None
                if insta_name is not None and current_insta != insta_name:
                    raise RuntimeError(
                        "Act update blocked (likely RLS policy): "
                        f"name='{act_name}', expected insta_name='{insta_name}', "
                        f"current insta_name='{current_insta}'."
                    )
                if supports_soundcloud_url and soundcloud_url is not None:
                    current_soundcloud = (
                        refreshed.data[0].get("soundcloud_url") if refreshed.data else None
                    )
                    if current_soundcloud != soundcloud_url:
                        raise RuntimeError(
                            "Act update blocked (likely RLS policy): "
                            f"name='{act_name}', expected soundcloud_url='{soundcloud_url}', "
                            f"current soundcloud_url='{current_soundcloud}'."
                        )
            return act_id

        create_payload: dict[str, Any] = {"name": act_name, "insta_name": insta_name}
        if supports_soundcloud_url:
            create_payload["soundcloud_url"] = soundcloud_url
        created = (
            supabase.table("acts")
            .insert(create_payload)
            .execute()
        )
        return int(created.data[0]["id"])
    except APIError as exc:
        raise _api_error(f"Act upsert failed for '{act_name}'", exc) from exc


def _parse_act(raw_act: Any) -> tuple[str, str | None, str | None, str | None, str | None]:
    if isinstance(raw_act, str):
        return raw_act.strip(), None, None, None, None
    if isinstance(raw_act, dict):
        name = str(raw_act.get("name", "")).strip()
        start_time = raw_act.get("start_time")
        end_time = raw_act.get("end_time")
        insta_name = raw_act.get("insta_name")
        soundcloud_url = raw_act.get("soundcloud_url")
        if start_time is not None:
            start_time = str(start_time).strip()
        if end_time is not None:
            end_time = str(end_time).strip()
        if insta_name is not None:
            insta_name = str(insta_name).strip()
        if soundcloud_url is not None:
            soundcloud_url = str(soundcloud_url).strip()
        return (
            name,
            start_time or None,
            end_time or None,
            insta_name or None,
            soundcloud_url or None,
        )
    return "", None, None, None, None


@_retry_transport
def _upsert_event_act(
    supabase: Client,
    event_id: int,
    act_id: int,
    start_time: str | None,
    end_time: str | None,
    sort_order: int,
) -> None:
    try:
        existing = (
            supabase.table("event_acts")
            .select("id")
            .eq("event_id", event_id)
            .eq("act_id", act_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            payload: dict[str, Any] = {"sort_order": sort_order}
            if start_time is not None:
                payload["start_time"] = start_time
            if end_time is not None:
                payload["end_time"] = end_time
            (
                supabase.table("event_acts")
                .update(payload)
                .eq("id", existing.data[0]["id"])
                .execute()
            )
            return

        payload = {
            "event_id": event_id,
            "act_id": act_id,
            "start_time": start_time,
            "end_time": end_time,
            "sort_order": sort_order,
        }
        supabase.table("event_acts").insert(payload).execute()
    except APIError as exc:
        key = f"event_id={event_id}, act_id={act_id}"
        raise _api_error(f"event_acts upsert failed for {key}", exc) from exc


@_retry_transport
def _remove_stale_event_acts(
    supabase: Client,
    event_id: int,
    current_act_ids: set[int],
) -> int:
    try:
        existing = (
            supabase.table("event_acts")
            .select("id,act_id")
            .eq("event_id", event_id)
            .execute()
        ).data or []
        stale_ids = [
            int(row["id"])
            for row in existing
            if int(row["act_id"]) not in current_act_ids
        ]
        if stale_ids:
            supabase.table("event_acts").delete().in_("id", stale_ids).execute()
        return len(stale_ids)
    except APIError as exc:
        raise _api_error(f"Stale lineup cleanup failed for event_id={event_id}", exc) from exc


@_retry_transport
def _deactivate_missing_ra_events(
    supabase: Client,
    club_id: int,
    source_sync: dict[str, Any],
    current_ra_ids: set[str],
) -> int:
    if not source_sync.get("complete") or source_sync.get("source") != "ra":
        return 0
    window_start = str(source_sync.get("window_start") or "")
    window_end = str(source_sync.get("window_end") or "")
    if not window_start or not window_end:
        return 0

    try:
        rows = (
            supabase.table("events")
            .select("id,ra_id,event_date,event_end_date,is_active")
            .eq("club_id", club_id)
            .execute()
        ).data or []
        stale_ids = []
        for row in rows:
            ra_id = str(row.get("ra_id") or "").strip()
            start_date = str(row.get("event_date") or "")
            end_date = str(row.get("event_end_date") or start_date)
            overlaps_window = end_date >= window_start and start_date <= window_end
            if ra_id and overlaps_window and ra_id not in current_ra_ids and row.get("is_active") is not False:
                stale_ids.append(int(row["id"]))
        if stale_ids:
            supabase.table("events").update({"is_active": False}).in_("id", stale_ids).execute()
        return len(stale_ids)
    except APIError as exc:
        raise _api_error(f"RA snapshot cleanup failed for club_id={club_id}", exc) from exc


def seed_from_json(supabase: Client, payload: dict[str, Any], verbose: bool = True) -> None:
    supports_interested_count = _has_column(supabase, "events", "interested_count")
    supports_soundcloud_url = _has_column(supabase, "acts", "soundcloud_url")
    total_events, events_with_interested_key = _payload_interested_stats(payload)

    if verbose and total_events > 0:
        if not supports_interested_count:
            print(
                "[WARN] DB column events.interested_count not available (or not accessible). "
                "Interest values from JSON will not be written."
            )
        if events_with_interested_key == 0:
            print(
                "[WARN] Input JSON has no interested_count fields. "
                "Use scraper output from backend/fetcher/lineup_seed_example.json."
            )

    counters = {
        "cities": 0,
        "clubs": 0,
        "events": 0,
        "acts": 0,
        "event_acts": 0,
        "event_acts_removed": 0,
        "events_deactivated": 0,
    }

    for city in payload.get("cities", []):
        city_name = str(city.get("name", "")).strip()
        if not city_name:
            continue
        city_id = _get_or_create_city_id(supabase, city_name)
        counters["cities"] += 1

        for club in city.get("clubs", []):
            club_name = str(club.get("name", "")).strip()
            if not club_name:
                continue
            club_id = _get_or_create_club_id(supabase, city_id, club_name)
            counters["clubs"] += 1
            current_ra_ids: set[str] = set()

            for event in club.get("events", []):
                event_date = str(event.get("date", "")).strip()
                event_end_date = str(event.get("end_date") or event_date).strip() or None
                event_name = str(event.get("name", "")).strip()
                ra_id = str(event.get("ra_id") or "").strip() or None
                if ra_id:
                    current_ra_ids.add(ra_id)
                event_time_start = event.get("time_start")
                event_time_end = event.get("time_end")
                event_time_start = (
                    str(event_time_start).strip() if event_time_start is not None else None
                )
                event_time_end = (
                    str(event_time_end).strip() if event_time_end is not None else None
                )
                event_time_start = event_time_start or None
                event_time_end = event_time_end or None
                interested_count = event.get("interested_count")
                if interested_count is not None:
                    try:
                        interested_count = int(interested_count)
                    except (TypeError, ValueError):
                        interested_count = None
                if not event_date:
                    continue

                event_id, duplicate_ids = _get_or_create_event_id(
                    supabase,
                    club_id,
                    event_date,
                    event_end_date,
                    event_name,
                    event_time_start,
                    event_time_end,
                    interested_count,
                    supports_interested_count,
                    ra_id,
                )
                counters["events"] += 1
                if duplicate_ids:
                    (
                        supabase.table("events")
                        .update({"is_active": False})
                        .in_("id", duplicate_ids)
                        .execute()
                    )
                    counters["events_deactivated"] += len(duplicate_ids)

                current_act_ids: set[int] = set()
                for idx, raw_act in enumerate(event.get("acts", []), start=1):
                    (
                        act_name,
                        act_start_time,
                        act_end_time,
                        act_insta_name,
                        act_soundcloud_url,
                    ) = _parse_act(raw_act)
                    if not act_name:
                        continue
                    act_id = _get_or_create_act_id(
                        supabase,
                        act_name,
                        insta_name=act_insta_name,
                        soundcloud_url=act_soundcloud_url,
                        supports_soundcloud_url=supports_soundcloud_url,
                    )
                    counters["acts"] += 1
                    current_act_ids.add(act_id)

                    _upsert_event_act(
                        supabase=supabase,
                        event_id=event_id,
                        act_id=act_id,
                        start_time=act_start_time,
                        end_time=act_end_time,
                        sort_order=idx,
                    )
                    counters["event_acts"] += 1

                if ra_id:
                    counters["event_acts_removed"] += _remove_stale_event_acts(
                        supabase,
                        event_id,
                        current_act_ids,
                    )

            counters["events_deactivated"] += _deactivate_missing_ra_events(
                supabase,
                club_id,
                club.get("source_sync") or {},
                current_ra_ids,
            )

    if verbose:
        print("Seed completed.")
        print(
            "Processed entries:",
            ", ".join(f"{table}={count}" for table, count in counters.items()),
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Seed lineup JSON into Supabase tables: "
            "cities, clubs, events, acts, event_acts"
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Path to lineup JSON file (default: {DEFAULT_INPUT})",
    )
    args = parser.parse_args()

    try:
        payload = _load_json(args.input)
        supabase = _supabase_client()
        _ensure_required_tables(supabase)
        seed_from_json(supabase, payload, verbose=True)
    except (RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
