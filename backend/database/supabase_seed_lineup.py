import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import Client, create_client

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_INPUT = Path(__file__).with_name("lineup_seed_example.json")
DEFAULT_SCHEMA_SQL = Path(__file__).with_name("lineup_init.sql")

load_dotenv(ROOT_ENV_FILE)


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _supabase_client() -> Client:
    supabase_url = _required_env("SUPABASE_URL")
    # Prefer service role for backend writes, fall back to anon key.
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or _required_env(
        "SUPABASE_ANON_KEY"
    )
    return create_client(supabase_url, supabase_key)


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or not isinstance(payload.get("cities"), list):
        raise ValueError("Input JSON must contain key 'cities' with a list value.")
    return payload


def _api_error(prefix: str, exc: APIError) -> RuntimeError:
    message = getattr(exc, "message", str(exc))
    code = getattr(exc, "code", "unknown")
    return RuntimeError(f"{prefix} (code: {code}): {message}")


def _has_column(supabase: Client, table: str, column: str) -> bool:
    try:
        supabase.table(table).select(column).limit(1).execute()
        return True
    except APIError:
        return False


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
        supabase.table("events").select("time_start,time_end").limit(1).execute()
    except APIError as exc:
        raise RuntimeError(
            "Schema mismatch: 'events.time_start/time_end' fehlen. "
            f"Run SQL from '{DEFAULT_SCHEMA_SQL}' in the Supabase SQL Editor to migrate."
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


def _get_or_create_event_id(
    supabase: Client,
    club_id: int,
    event_date: str,
    event_name: str,
    time_start: str | None,
    time_end: str | None,
    interested_count: int | None,
    supports_interested_count: bool,
) -> int:
    try:
        found = (
            supabase.table("events")
            .select("id")
            .eq("club_id", club_id)
            .eq("event_date", event_date)
            .eq("event_name", event_name)
            .limit(1)
            .execute()
        )
        if found.data:
            event_id = int(found.data[0]["id"])
            update_payload: dict[str, Any] = {}
            if time_start is not None:
                update_payload["time_start"] = time_start
            if time_end is not None:
                update_payload["time_end"] = time_end
            if supports_interested_count and interested_count is not None:
                update_payload["interested_count"] = interested_count
            if update_payload:
                (
                    supabase.table("events")
                    .update(update_payload)
                    .eq("id", event_id)
                    .execute()
                )
            return event_id

        create_payload: dict[str, Any] = {
            "club_id": club_id,
            "event_date": event_date,
            "event_name": event_name,
            "time_start": time_start,
            "time_end": time_end,
        }
        if supports_interested_count:
            create_payload["interested_count"] = interested_count
        created = (
            supabase.table("events")
            .insert(create_payload)
            .execute()
        )
        return int(created.data[0]["id"])
    except APIError as exc:
        label = f"{event_date} / {event_name or '<no-name>'}"
        raise _api_error(f"Event upsert failed for '{label}'", exc) from exc


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
            .eq("name", act_name)
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


def seed_from_json(supabase: Client, payload: dict[str, Any], verbose: bool = True) -> None:
    supports_interested_count = _has_column(supabase, "events", "interested_count")
    supports_soundcloud_url = _has_column(supabase, "acts", "soundcloud_url")
    counters = {
        "cities": 0,
        "clubs": 0,
        "events": 0,
        "acts": 0,
        "event_acts": 0,
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

            for event in club.get("events", []):
                event_date = str(event.get("date", "")).strip()
                event_name = str(event.get("name", "")).strip()
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

                event_id = _get_or_create_event_id(
                    supabase,
                    club_id,
                    event_date,
                    event_name,
                    event_time_start,
                    event_time_end,
                    interested_count,
                    supports_interested_count,
                )
                counters["events"] += 1

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

                    _upsert_event_act(
                        supabase=supabase,
                        event_id=event_id,
                        act_id=act_id,
                        start_time=act_start_time,
                        end_time=act_end_time,
                        sort_order=idx,
                    )
                    counters["event_acts"] += 1

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
