"""Update public RA interested counts for existing Setradar events.

The venue listing fetched here is also the fastest signal that RA has
cancelled or unpublished an event: such events vanish from the venue page
while their detail page keeps resolving. Rows for the next DAYS_AHEAD days
whose ra_id is no longer listed are therefore set to is_active = false so the
website stops showing them within hours instead of waiting for the weekly
snapshot.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import date, timedelta
from typing import Any

from postgrest.exceptions import APIError
from supabase import Client

try:
    from ..database.seed_event_hype import _supabase_client, seed_upcoming_hype
    from .ra_client import fetch_venue_listing
    from .venues_config import VenuesConfigError, load_venues_config
except ImportError:
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from backend.database.seed_event_hype import _supabase_client, seed_upcoming_hype
    from backend.fetcher.ra_client import fetch_venue_listing
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


def fetch_venue_snapshot(
    venue_cfg: dict,
    *,
    today: date | None = None,
) -> dict:
    """Return interested counts plus the complete set of listed RA ids.

    ``listed_ra_ids`` is ``None`` when RA did not answer, returned no venue or
    truncated the listing. Callers must then skip deactivation for the venue.
    """
    start = today or date.today()
    cutoff = start + timedelta(days=DAYS_AHEAD)
    try:
        raw_events = fetch_venue_listing(VENUE_INTEREST_QUERY, venue_cfg["venue_id"])
    except RuntimeError as exc:
        LOGGER.warning(
            "[!] %s: Snapshot unvollstaendig (keine Deaktivierung): %s",
            venue_cfg["club"],
            exc,
        )
        listed_ra_ids = None
        raw_events = []
    else:
        listed_ra_ids = {
            str(event.get("id") or "").strip()
            for event in raw_events
            if str(event.get("id") or "").strip()
        }

    interest: list[dict] = []
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
        interest.append(
            {
                "ra_id": str(event.get("id") or ""),
                "city": venue_cfg["city"],
                "club": venue_cfg["club"],
                "event_date": event_date.isoformat(),
                "event_name": event_name,
                "interested_count": interested_count,
            }
        )
    return {
        "city": venue_cfg["city"],
        "club": venue_cfg["club"],
        "interest": interest,
        "listed_ra_ids": listed_ra_ids,
    }


def fetch_venue_interest(
    venue_cfg: dict,
    *,
    today: date | None = None,
) -> list[dict]:
    return fetch_venue_snapshot(venue_cfg, today=today)["interest"]


def scrape_venues(venues: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (interested rows, per-venue listings) for all configured venues."""
    scraped: list[dict] = []
    listings: list[dict] = []
    for index, venue_cfg in enumerate(venues):
        if index:
            time.sleep(REQUEST_DELAY)
        snapshot = fetch_venue_snapshot(venue_cfg)
        scraped.extend(snapshot["interest"])
        listings.append(
            {
                "city": snapshot["city"],
                "club": snapshot["club"],
                "listed_ra_ids": snapshot["listed_ra_ids"],
            }
        )
        LOGGER.info(
            "[ok] %s, %s: %s Interested-Wert(e)",
            venue_cfg["club"],
            venue_cfg["city"],
            len(snapshot["interest"]),
        )
    incomplete = [item["club"] for item in listings if item["listed_ra_ids"] is None]
    if incomplete:
        raise RuntimeError("Unvollstaendige RA-Snapshots; keine DB-Aenderungen: " + ", ".join(incomplete))
    return scraped, listings


def scrape_interest(venues: list[dict]) -> list[dict]:
    return scrape_venues(venues)[0]


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
    db_events_by_ra_id = {
        str(event.get("ra_id")): event
        for event in events
        if event.get("id") is not None and event.get("ra_id")
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
        fallback_key = (club_id, item["event_date"], item["event_name"])
        matched_event = db_events_by_ra_id.get(str(item.get("ra_id") or ""))
        if matched_event is None:
            matched_event = db_events.get(fallback_key)
        if matched_event is None:
            unmatched.append(item)
            continue
        key = (
            int(matched_event["club_id"]),
            str(matched_event.get("event_date") or ""),
            str(matched_event.get("event_name") or "").strip(),
        )
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


def build_deactivations(
    listings: list[dict],
    clubs: list[dict],
    events: list[dict],
    *,
    today: date,
    cutoff: date,
) -> list[dict]:
    """Return active DB rows in [today, cutoff] that RA no longer lists.

    Only rows carrying a ra_id are considered: legacy rows are handled by the
    weekly snapshot. Venues whose listing is ``None`` (RA failure or truncated
    response) are skipped entirely so a transient outage never hides events.
    Rows are never re-activated here because the weekly scraper deliberately
    deactivates shadow listings that RA still shows.
    """
    club_ids = {
        (_city_name(club), str(club.get("name") or "").strip()): int(club["id"])
        for club in clubs
        if club.get("id") is not None
    }
    listed_by_club: dict[int, set[str]] = {}
    for listing in listings:
        listed = listing.get("listed_ra_ids")
        if listed is None:
            continue
        club_id = club_ids.get((listing["city"], listing["club"]))
        if club_id is None:
            continue
        listed_by_club[club_id] = set(listed)

    stale: list[dict] = []
    for event in events:
        if event.get("id") is None or event.get("club_id") is None:
            continue
        if event.get("is_active") is False:
            continue
        ra_id = str(event.get("ra_id") or "").strip()
        if not ra_id:
            continue
        club_id = int(event["club_id"])
        if club_id not in listed_by_club or ra_id in listed_by_club[club_id]:
            continue
        event_date = _parse_ra_date(event.get("event_date"))
        if event_date is None or not today <= event_date <= cutoff:
            continue
        stale.append(
            {
                "id": int(event["id"]),
                "club_id": club_id,
                "event_date": event_date.isoformat(),
                "event_name": str(event.get("event_name") or ""),
                "ra_id": ra_id,
            }
        )
    return stale


def update_database(
    supabase: Client,
    scraped: list[dict],
    listings: list[dict] | None = None,
    *,
    dry_run: bool = False,
) -> tuple[int, int]:
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
            .select("id,club_id,event_date,event_name,ra_id,is_active")
            .gte("event_date", today.isoformat())
            .lte("event_date", cutoff.isoformat())
            .execute()
        )
        event_rows = list(events_response.data or [])
        scraped_ra_ids = sorted({
            str(item.get("ra_id") or "")
            for item in scraped
            if item.get("ra_id")
        })
        if scraped_ra_ids:
            identity_response = (
                supabase.table("events")
                .select("id,club_id,event_date,event_name,ra_id,is_active")
                .in_("ra_id", scraped_ra_ids)
                .execute()
            )
            event_rows_by_id = {
                int(row["id"]): row
                for row in [*event_rows, *(identity_response.data or [])]
            }
            event_rows = list(event_rows_by_id.values())
        updates, unmatched = build_event_updates(
            scraped,
            clubs_response.data or [],
            event_rows,
        )
        if scraped and not updates:
            raise RuntimeError(
                "RA returned interested counts, but none matched an existing DB event."
            )
        for update in ([] if dry_run else updates):
            (
                supabase.table("events")
                .update({"interested_count": update["interested_count"]})
                .eq("id", update["id"])
                .execute()
            )

        stale = build_deactivations(
            listings or [],
            clubs_response.data or [],
            list(events_response.data or []),
            today=today,
            cutoff=cutoff,
        )
        if stale:
            for item in stale:
                LOGGER.info(
                    "[x] Nicht mehr auf RA gelistet: %s | %s | RA %s",
                    item["event_date"],
                    item["event_name"],
                    item["ra_id"],
                )
            if not dry_run:
                (
                    supabase.table("events")
                    .update({"is_active": False})
                    .in_("id", [item["id"] for item in stale])
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
    return len(updates), len(stale)


def main() -> None:
    _configure_console()
    parser = argparse.ArgumentParser(description="Update RA interested counts and delisted events")
    parser.add_argument("--dry-run", action="store_true", help="Read RA and Supabase without writing")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        venues = load_venues_config()
        scraped, listings = scrape_venues(venues)
        supabase = _supabase_client()
        updated, deactivated = update_database(supabase, scraped, listings, dry_run=args.dry_run)
        seeded = 0 if args.dry_run else seed_upcoming_hype(supabase, DAYS_AHEAD)
    except (RuntimeError, ValueError, VenuesConfigError) as exc:
        LOGGER.error("[ERROR] %s", exc)
        raise SystemExit(1) from exc

    LOGGER.info(
        "[%s] Interested: %s DB-Event(s), %s Deaktivierungen, %s Hype-Zaehler.",
        "dry-run" if args.dry_run else "ok",
        updated,
        deactivated,
        seeded,
    )


if __name__ == "__main__":
    main()
