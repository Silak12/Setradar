"""Update public RA interested counts for existing Setradar events."""

from __future__ import annotations

import logging
import sys
import time
from datetime import date, timedelta
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client

try:
    from ..database.seed_event_hype import _supabase_client, seed_upcoming_hype
    from .ra_client import gql
    from .venues_config import VenuesConfigError, load_venues_config
except ImportError:
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from backend.database.seed_event_hype import _supabase_client, seed_upcoming_hype
    from backend.fetcher.ra_client import gql
    from backend.fetcher.venues_config import VenuesConfigError, load_venues_config

DAYS_AHEAD = 28
REQUEST_DELAY = 1.0
LOGGER = logging.getLogger(__name__)

VENUE_INTEREST_QUERY = """
query GET_VENUE_EVENT_INTEREST($id: ID!, $limit: Int) {
  venue(id: $id) {
    events(type: LATEST, limit: $limit) {
      id
      title
      date
      interestedCount
    }
  }
}
"""


def _configure_console() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except ValueError:
                pass


def _parse_ra_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def _parse_interested_count(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def fetch_venue_interest(
    venue_cfg: dict,
    *,
    today: date | None = None,
) -> list[dict]:
    start = today or date.today()
    cutoff = start + timedelta(days=DAYS_AHEAD)
    limit = 50
    data = gql(VENUE_INTEREST_QUERY, {"id": venue_cfg["venue_id"], "limit": limit})
    venue = (data.get("data") or {}).get("venue") if data else None
    raw_events = (venue or {}).get("events") or []
    if isinstance(raw_events, dict):
        raw_events = raw_events.get("data", [])

    result: list[dict] = []
    for event in raw_events:
        event_date = _parse_ra_date(event.get("date"))
        interested_count = _parse_interested_count(event.get("interestedCount"))
        event_name = str(event.get("title") or "").strip()
        if (
            event_date is None
            or not start <= event_date <= cutoff
            or interested_count is None
            or not event_name
        ):
            continue
        result.append(
            {
                "ra_id": str(event.get("id") or ""),
                "city": venue_cfg["city"],
                "club": venue_cfg["club"],
                "event_date": event_date.isoformat(),
                "event_name": event_name,
                "interested_count": interested_count,
            }
        )
    return result


def scrape_interest(venues: list[dict]) -> list[dict]:
    scraped: list[dict] = []
    for index, venue_cfg in enumerate(venues):
        if index:
            time.sleep(REQUEST_DELAY)
        events = fetch_venue_interest(venue_cfg)
        scraped.extend(events)
        LOGGER.info(
            "[ok] %s, %s: %s Interested-Wert(e)",
            venue_cfg["club"],
            venue_cfg["city"],
            len(events),
        )
    return scraped


def _city_name(club: dict) -> str:
    city = club.get("cities") or {}
    if isinstance(city, list):
        city = city[0] if city else {}
    return str(city.get("name") or "").strip()


def build_event_updates(
    scraped: list[dict],
    clubs: list[dict],
    events: list[dict],
) -> tuple[list[dict], list[dict]]:
    club_ids = {
        (_city_name(club), str(club.get("name") or "").strip()): int(club["id"])
        for club in clubs
        if club.get("id") is not None
    }
    db_events = {
        (
            int(event["club_id"]),
            str(event.get("event_date") or ""),
            str(event.get("event_name") or "").strip(),
        ): event
        for event in events
        if event.get("id") is not None and event.get("club_id") is not None
    }

    # The current DB schema merges duplicate RA listings with the same
    # club/date/title. Keep the larger public count in that rare case.
    counts_by_key: dict[tuple[int, str, str], int] = {}
    unmatched: list[dict] = []
    for item in scraped:
        club_id = club_ids.get((item["city"], item["club"]))
        if club_id is None:
            unmatched.append(item)
            continue
        key = (club_id, item["event_date"], item["event_name"])
        if key not in db_events:
            unmatched.append(item)
            continue
        counts_by_key[key] = max(
            counts_by_key.get(key, 0),
            int(item["interested_count"]),
        )

    updates = []
    for key, interested_count in counts_by_key.items():
        event = db_events[key]
        updates.append(
            {
                "id": int(event["id"]),
                "club_id": int(event["club_id"]),
                "event_date": str(event["event_date"]),
                "event_name": str(event.get("event_name") or ""),
                "interested_count": interested_count,
            }
        )
    return updates, unmatched


def update_database(supabase: Client, scraped: list[dict]) -> int:
    today = date.today()
    cutoff = today + timedelta(days=DAYS_AHEAD)
    try:
        clubs_response = (
            supabase.table("clubs")
            .select("id,name,cities(name)")
            .execute()
        )
        events_response = (
            supabase.table("events")
            .select("id,club_id,event_date,event_name")
            .gte("event_date", today.isoformat())
            .lte("event_date", cutoff.isoformat())
            .execute()
        )
        updates, unmatched = build_event_updates(
            scraped,
            clubs_response.data or [],
            events_response.data or [],
        )
        if scraped and not updates:
            raise RuntimeError(
                "RA returned interested counts, but none matched an existing DB event."
            )
        for start in range(0, len(updates), 200):
            (
                supabase.table("events")
                .upsert(updates[start : start + 200], on_conflict="id")
                .execute()
            )
    except APIError as exc:
        message = getattr(exc, "message", str(exc))
        raise RuntimeError(f"Supabase interested update failed: {message}") from exc

    if unmatched:
        LOGGER.warning(
            "[!] %s RA Event(s) noch nicht in der Setradar-DB; Werte übersprungen.",
            len(unmatched),
        )
        for item in unmatched[:10]:
            LOGGER.debug(
                "    %s | %s | %s | RA %s",
                item["event_date"],
                item["club"],
                item["event_name"],
                item["ra_id"],
            )
    return len(updates)


def main() -> None:
    _configure_console()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        venues = load_venues_config()
        scraped = scrape_interest(venues)
        supabase = _supabase_client()
        updated = update_database(supabase, scraped)
        seeded = seed_upcoming_hype(supabase, DAYS_AHEAD)
    except (RuntimeError, ValueError, VenuesConfigError) as exc:
        LOGGER.error("[ERROR] %s", exc)
        raise SystemExit(1) from exc

    LOGGER.info(
        "[ok] Interested aktualisiert: %s DB-Event(s), %s Hype-Zähler.",
        updated,
        seeded,
    )


if __name__ == "__main__":
    main()
