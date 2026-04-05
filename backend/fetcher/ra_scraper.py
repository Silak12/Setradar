"""
setradar - ra_scraper.py
-------------------------
Holt Venue-Events von der inoffiziellen RA GraphQL-API
und schreibt sie ins lineup_seed_example.json-Format.

Usage:
    python ra_scraper.py
    python ra_scraper.py --weeks 4 --dry-run
    python ra_scraper.py --output my_lineup.json
"""

import argparse
import json
import logging
import sys
import time
from datetime import date, timedelta
from pathlib import Path

try:
    from .ra_client import gql
    from .transform import build_lineup_json
    from .venues_config import VenuesConfigError, load_venues_config
except ImportError:
    from ra_client import gql
    from transform import build_lineup_json
    from venues_config import VenuesConfigError, load_venues_config

# ── Konfiguration ─────────────────────────────────────────────────────────────

DEFAULT_OUTPUT = Path(__file__).parent / "lineup_seed_example.json"
REQUEST_DELAY  = 1.0
DEFAULT_WEEKS  = 8
LOGGER = logging.getLogger(__name__)

# ── GraphQL Queries ────────────────────────────────────────────────────────────
#
# FROMDATE sortiert ab dem ältesten DB-Eintrag – NICHT ab dem übergebenen Datum.
# LATEST gibt die aktuell laufenden / nächsten Events zurück → das wollen wir.
# limit = großzügig setzen, dann serverseitig nach Datum filtern.

VENUE_EVENTS_QUERY = """
query GET_VENUE_EVENTS($id: ID!, $limit: Int) {
  venue(id: $id) {
    id
    name
    area {
      id
      name
    }
    events(type: LATEST, limit: $limit) {
      id
      title
      date
      startTime
      endTime
      lineup
      artists {
        id
        name
        urlSafeName
      }
    }
  }
}
"""

EVENT_DETAIL_QUERY = """
query GET_EVENT_DETAIL($id: ID!) {
  event(id: $id) {
    id
    title
    date
    startTime
    endTime
    lineup
    artists {
      id
      name
      urlSafeName
    }
    venue {
      id
      name
    }
  }
}
"""

def configure_console_output() -> None:
    """
    Force UTF-8 output on Python 3.7+ so Windows cp1252 consoles do not crash on
    symbols used in status messages. Fall back silently if reconfigure is unavailable.
    """
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except ValueError:
                # Some wrapped streams reject reconfigure after initialization.
                pass


def configure_logging(debug: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(message)s",
    )


# ── Scraping ──────────────────────────────────────────────────────────────────

def fetch_venue_events(venue_id: int, weeks_ahead: int = DEFAULT_WEEKS) -> list[dict]:
    """
    Nutzt LATEST mit großem limit, filtert dann lokal auf [heute, heute+weeks].
    LATEST gibt kommende + gerade laufende Events zurück.
    """
    today  = date.today()
    cutoff = today + timedelta(weeks=weeks_ahead)
    # Großzügiges Limit: selbst bei täglich Events wären 8 Wochen = ~60 Events
    limit  = max(weeks_ahead * 10, 50)

    LOGGER.info("  Lade Events via venue-Query (venue_id=%s, LATEST, limit=%s)...", venue_id, limit)
    data = gql(VENUE_EVENTS_QUERY, {"id": venue_id, "limit": limit})

    if not data:
        return []

    venue_data = (data.get("data") or {}).get("venue")
    if not venue_data:
        LOGGER.warning("  [–] Keine venue-Daten erhalten.")
        return []

    raw = venue_data.get("events") or []
    if isinstance(raw, dict):  # Sicherheitsnetz falls paginiertes Objekt
        raw = raw.get("data", [])

    result = []
    for event in raw:
        event_date_str = (event.get("date") or "")[:10]
        try:
            event_date = date.fromisoformat(event_date_str)
        except ValueError:
            continue
        # Nur Events im gewünschten Zeitraum
        if today <= event_date <= cutoff:
            result.append(event)

    LOGGER.info(
        "  -> %s Events von RA erhalten, %s im Zeitfenster (%s - %s)",
        len(raw),
        len(result),
        today,
        cutoff,
    )
    return result


def enrich_artists(event: dict) -> dict:
    """Detail-Query wenn artists-Array leer ist."""
    if event.get("artists"):
        return event
    event_id = event.get("id")
    if not event_id:
        return event
    LOGGER.debug("    Detail-Query fuer Event %s (%s)...", event_id, event.get("title", "")[:40])
    data   = gql(EVENT_DETAIL_QUERY, {"id": event_id})
    detail = (data.get("data") or {}).get("event")
    return detail if detail else event


def scrape_venue(venue_cfg: dict, weeks_ahead: int) -> list[dict]:
    venue_id = venue_cfg["venue_id"]
    events   = fetch_venue_events(venue_id, weeks_ahead)

    if not events:
        LOGGER.info("  [–] Keine Events im Zeitfenster fuer venue_id=%s", venue_id)
        return []

    enriched = []
    for event in events:
        time.sleep(REQUEST_DELAY * 0.3)
        enriched.append(enrich_artists(event))
    return enriched


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    configure_console_output()
    parser = argparse.ArgumentParser(description="RA → lineup_seed JSON")
    parser.add_argument("--weeks",   type=int,  default=DEFAULT_WEEKS,
                        help=f"Wie viele Wochen voraus (default: {DEFAULT_WEEKS})")
    parser.add_argument("--output",  type=Path, default=DEFAULT_OUTPUT,
                        help=f"Output JSON (default: {DEFAULT_OUTPUT})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur scrapen + JSON schreiben, kein DB-Seed")
    parser.add_argument("--debug", action="store_true", help="Debug Logging aktivieren")
    args = parser.parse_args()

    configure_logging(args.debug)
    try:
        venues = load_venues_config()
    except VenuesConfigError as exc:
        LOGGER.error("[!] Ungueltige Venue-Konfiguration: %s", exc)
        sys.exit(2)

    LOGGER.info("[*] RA Scraper - %s Wochen voraus", args.weeks)

    scraped: dict[int, list[dict]] = {}
    for venue_cfg in venues:
        LOGGER.info("== %s, %s (venue_id=%s) ==", venue_cfg["club"], venue_cfg["city"], venue_cfg["venue_id"])
        events = scrape_venue(venue_cfg, args.weeks)
        scraped[venue_cfg["venue_id"]] = events
        LOGGER.info("  [ok] %s Event(s) im Zeitfenster", len(events))

    payload = build_lineup_json(venues, scraped)

    total_events = sum(len(club["events"]) for city in payload["cities"] for club in city["clubs"])
    total_acts   = sum(
        len(e["acts"])
        for city in payload["cities"]
        for club in city["clubs"]
        for e in club["events"]
    )
    LOGGER.info("[ok] Gesamt: %s Event(s), %s Act-Slot(s)", total_events, total_acts)

    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    LOGGER.info("[ok] JSON gespeichert: %s", args.output)

    if not args.dry_run:
        import subprocess
        seed = Path(__file__).parent.parent / "database" / "supabase_seed_lineup.py"
        if seed.exists():
            LOGGER.info("[->] Starte supabase_seed_lineup.py...")
            subprocess.run([sys.executable, str(seed), "--input", str(args.output)])
        else:
            LOGGER.warning("[!] supabase_seed_lineup.py nicht gefunden.")
            LOGGER.info("    Manuell: python supabase_seed_lineup.py --input %s", args.output)
    else:
        LOGGER.info("[dry-run] Manuell seeden:")
        LOGGER.info("  python supabase_seed_lineup.py --input %s", args.output)


if __name__ == "__main__":
    main()
