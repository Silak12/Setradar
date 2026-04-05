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
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

# ── Konfiguration ─────────────────────────────────────────────────────────────

RA_GRAPHQL_URL = "https://ra.co/graphql"

# area_id = RA interne ID (Berlin = 34, ermittelt via Introspection)
VENUES = [
    {
        "city":     "Berlin",
        "club":     "Lokschuppen",
        "venue_id": 17071,
        "area_id":  34,
    },
    {
        "city":     "Berlin",
        "club":     "RSO",
        "venue_id": 185172,
        "area_id":  34,
    },
    {
        "city":     "Berlin",
        "club":     "OST",
        "venue_id": 141987,
        "area_id":  34,
    },
    {
        "city":     "Berlin",
        "club":     "Ritter Butzke",
        "venue_id": 6950,
        "area_id":  34,
    }
    # { "city": "Hamburg", "club": "Übel & Gefährlich", "venue_id": 12345, "area_id": 14 },
]

DEFAULT_OUTPUT = Path(__file__).parent / "lineup_seed_example.json"
REQUEST_DELAY  = 1.0
DEFAULT_WEEKS  = 8

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

# ── HTTP ──────────────────────────────────────────────────────────────────────

HEADERS = {
    "Content-Type":        "application/json",
    "Accept":              "application/json",
    "Referer":             "https://ra.co/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "ra-content-language": "de",
}


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


def gql(query: str, variables: dict, retries: int = 3) -> dict:
    payload = {"query": query, "variables": variables}
    for attempt in range(1, retries + 1):
        try:
            resp = requests.post(RA_GRAPHQL_URL, headers=HEADERS, json=payload, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                msgs = [e.get("message", "") for e in data["errors"]]
                print(f"  [GQL Errors] {msgs}")
            return data
        except requests.RequestException as e:
            print(f"  [!] Request-Fehler (Versuch {attempt}/{retries}): {e}")
            if attempt < retries:
                time.sleep(2 ** attempt)
    return {}


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

    print(f"  Lade Events via venue-Query (venue_id={venue_id}, LATEST, limit={limit})...")
    data = gql(VENUE_EVENTS_QUERY, {"id": venue_id, "limit": limit})

    if not data:
        return []

    venue_data = (data.get("data") or {}).get("venue")
    if not venue_data:
        print("  [–] Keine venue-Daten erhalten.")
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

    print(f"  → {len(raw)} Events von RA erhalten, {len(result)} im Zeitfenster ({today} – {cutoff})")
    return result


def enrich_artists(event: dict) -> dict:
    """Detail-Query wenn artists-Array leer ist."""
    if event.get("artists"):
        return event
    event_id = event.get("id")
    if not event_id:
        return event
    print(f"    Detail-Query für Event {event_id} ({event.get('title', '')[:40]})...")
    data   = gql(EVENT_DETAIL_QUERY, {"id": event_id})
    detail = (data.get("data") or {}).get("event")
    return detail if detail else event


def scrape_venue(venue_cfg: dict, weeks_ahead: int) -> list[dict]:
    venue_id = venue_cfg["venue_id"]
    events   = fetch_venue_events(venue_id, weeks_ahead)

    if not events:
        print(f"  [–] Keine Events im Zeitfenster für venue_id={venue_id}")
        return []

    enriched = []
    for event in events:
        time.sleep(REQUEST_DELAY * 0.3)
        enriched.append(enrich_artists(event))
    return enriched


# ── JSON-Aufbau ───────────────────────────────────────────────────────────────

def event_to_acts(event: dict) -> list[dict]:
    acts = []
    for artist in (event.get("artists") or []):
        name = (artist.get("name") or "").strip()
        if name:
            acts.append({
                "name":       name,
                "insta_name": "",
                "start_time": None,
                "end_time":   None,
            })
    # Fallback: lineup-String parsen (kommagetrennte Namen)
    if not acts:
        for name in [n.strip() for n in (event.get("lineup") or "").split(",") if n.strip()]:
            acts.append({"name": name, "insta_name": "", "start_time": None, "end_time": None})
    return acts


def parse_time(raw: str | None) -> str | None:
    if not raw:
        return None
    return raw[11:16] if "T" in raw else raw[:5]


def build_lineup_json(venues_cfg: list[dict], scraped: dict[int, list[dict]]) -> dict:
    cities_map: dict[str, dict] = {}
    for venue_cfg in venues_cfg:
        city_name = venue_cfg["city"]
        club_name = venue_cfg["club"]
        venue_id  = venue_cfg["venue_id"]

        if city_name not in cities_map:
            cities_map[city_name] = {"name": city_name, "clubs": []}
        city = cities_map[city_name]

        club = next((c for c in city["clubs"] if c["name"] == club_name), None)
        if club is None:
            club = {"name": club_name, "events": []}
            city["clubs"].append(club)

        for event in (scraped.get(venue_id) or []):
            club["events"].append({
                "date":       (event.get("date") or "")[:10],
                "name":       (event.get("title") or "").strip(),
                "time_start": parse_time(event.get("startTime")),
                "time_end":   parse_time(event.get("endTime")),
                "acts":       event_to_acts(event),
                "ra_id":      event.get("id"),
                "ra_url":     f"https://ra.co/events/{event.get('id')}",
            })

    return {
        "scraped_at": date.today().isoformat() + "T00:00:00Z",
        "cities":     list(cities_map.values()),
    }


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
    args = parser.parse_args()

    print(f"[★] RA Scraper – {args.weeks} Wochen voraus\n")

    scraped: dict[int, list[dict]] = {}
    for venue_cfg in VENUES:
        print(f"── {venue_cfg['club']}, {venue_cfg['city']} (venue_id={venue_cfg['venue_id']}) ──")
        events = scrape_venue(venue_cfg, args.weeks)
        scraped[venue_cfg["venue_id"]] = events
        print(f"  [✓] {len(events)} Event(s) im Zeitfenster\n")

    payload = build_lineup_json(VENUES, scraped)

    total_events = sum(len(club["events"]) for city in payload["cities"] for club in city["clubs"])
    total_acts   = sum(
        len(e["acts"])
        for city in payload["cities"]
        for club in city["clubs"]
        for e in club["events"]
    )
    print(f"[✓] Gesamt: {total_events} Event(s), {total_acts} Act-Slot(s)")

    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[✓] JSON gespeichert: {args.output}")

    if not args.dry_run:
        import subprocess, sys
        seed = Path(__file__).parent.parent / "database" / "supabase_seed_lineup.py"
        if seed.exists():
            print("\n[→] Starte supabase_seed_lineup.py...")
            subprocess.run([sys.executable, str(seed), "--input", str(args.output)])
        else:
            print(f"\n[!] supabase_seed_lineup.py nicht gefunden.")
            print(f"    Manuell: python supabase_seed_lineup.py --input {args.output}")
    else:
        print(f"\n[dry-run] Manuell seeden:")
        print(f"  python supabase_seed_lineup.py --input {args.output}")


if __name__ == "__main__":
    main()
