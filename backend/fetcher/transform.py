import re
import unicodedata
from datetime import date, timedelta
from urllib.parse import urlparse


def _extract_social_name(raw: str | None, domain_hint: str) -> str:
    if not raw:
        return ""
    value = str(raw).strip()
    if not value:
        return ""

    if value.startswith("@"):
        return value[1:].strip()

    if value.startswith("http://") or value.startswith("https://"):
        try:
            parsed = urlparse(value)
            host = (parsed.netloc or "").lower()
            if domain_hint in host:
                parts = [p for p in (parsed.path or "").split("/") if p]
                if parts:
                    return parts[0].strip()
        except ValueError:
            return ""
    return value


def event_to_acts(event: dict) -> list[dict]:
    acts = []
    for artist in (event.get("artists") or []):
        name = (artist.get("name") or "").strip()
        if name:
            insta_raw = artist.get("instagram")
            soundcloud_raw = artist.get("soundcloud")
            acts.append({
                "name": name,
                "insta_name": _extract_social_name(insta_raw, "instagram.com"),
                "insta_url": (insta_raw or "").strip() if isinstance(insta_raw, str) else "",
                "soundcloud_name": _extract_social_name(soundcloud_raw, "soundcloud.com"),
                "soundcloud_url": (soundcloud_raw or "").strip() if isinstance(soundcloud_raw, str) else "",
                "start_time": None,
                "end_time": None,
            })
    if not acts:
        for name in [n.strip() for n in (event.get("lineup") or "").split(",") if n.strip()]:
            acts.append(
                {
                    "name": name,
                    "insta_name": "",
                    "insta_url": "",
                    "soundcloud_name": "",
                    "soundcloud_url": "",
                    "start_time": None,
                    "end_time": None,
                }
            )
    return acts


def parse_time(raw: str | None) -> str | None:
    if not raw:
        return None
    return raw[11:16] if "T" in raw else raw[:5]


def parse_date(raw: str | None) -> str | None:
    if not raw:
        return None
    value = str(raw)[:10]
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def get_event_end_date(event: dict) -> str | None:
    event_date = parse_date(event.get("date"))
    explicit_end_date = parse_date(event.get("endTime"))
    if explicit_end_date or not event_date:
        return explicit_end_date or event_date
    start_time = parse_time(event.get("startTime"))
    end_time = parse_time(event.get("endTime"))
    if start_time and end_time and end_time <= start_time:
        return (date.fromisoformat(event_date) + timedelta(days=1)).isoformat()
    return event_date


def _normalize_event_title(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).split())


def _same_ra_listing(first: dict, second: dict) -> bool:
    if parse_date(first.get("date")) != parse_date(second.get("date")):
        return False
    if get_event_end_date(first) != get_event_end_date(second):
        return False
    if parse_time(first.get("startTime")) != parse_time(second.get("startTime")):
        return False
    if parse_time(first.get("endTime")) != parse_time(second.get("endTime")):
        return False
    first_title = _normalize_event_title(first.get("title"))
    second_title = _normalize_event_title(second.get("title"))
    if not first_title or not second_title:
        return False
    return first_title == second_title or (
        min(len(first_title), len(second_title)) >= 8
        and (first_title.startswith(second_title) or second_title.startswith(first_title))
    )


def _ra_id_sort_key(event: dict) -> tuple[int, str]:
    ra_id = str(event.get("id") or "").strip()
    return (int(ra_id), ra_id) if ra_id.isdigit() else (-1, ra_id)


def _deduplicate_ra_events(events: list[dict]) -> list[dict]:
    """Keep the newest RA representation of duplicate venue listings."""
    by_ra_id: dict[str, dict] = {}
    without_id: list[dict] = []
    for event in events:
        ra_id = str(event.get("id") or "").strip()
        if ra_id:
            by_ra_id[ra_id] = event
        else:
            without_id.append(event)

    result: list[dict] = []
    for event in [*by_ra_id.values(), *without_id]:
        duplicate_index = next(
            (index for index, current in enumerate(result) if _same_ra_listing(current, event)),
            None,
        )
        if duplicate_index is None:
            result.append(event)
        elif _ra_id_sort_key(event) > _ra_id_sort_key(result[duplicate_index]):
            result[duplicate_index] = event
    return result


def build_lineup_json(
    venues_cfg: list[dict],
    scraped: dict[int, list[dict]],
    *,
    sync_start: date | None = None,
    sync_end: date | None = None,
) -> dict:
    cities_map: dict[str, dict] = {}
    for venue_cfg in venues_cfg:
        city_name = venue_cfg["city"]
        club_name = venue_cfg["club"]
        venue_id = venue_cfg["venue_id"]

        if city_name not in cities_map:
            cities_map[city_name] = {"name": city_name, "clubs": []}
        city = cities_map[city_name]

        club = next((c for c in city["clubs"] if c["name"] == club_name), None)
        if club is None:
            club = {"name": club_name, "events": []}
            if sync_start is not None and sync_end is not None:
                club["source_sync"] = {
                    "source": "ra",
                    "venue_id": str(venue_id),
                    "window_start": sync_start.isoformat(),
                    "window_end": sync_end.isoformat(),
                    "complete": True,
                }
            city["clubs"].append(club)

        for event in _deduplicate_ra_events(scraped.get(venue_id) or []):
            event_date = parse_date(event.get("date"))
            event_end_date = get_event_end_date(event) or event_date
            club["events"].append({
                "date": event_date or "",
                "end_date": event_end_date,
                "name": (event.get("title") or "").strip(),
                "time_start": parse_time(event.get("startTime")),
                "time_end": parse_time(event.get("endTime")),
                "interested_count": event.get("interestedCount"),
                "acts": event_to_acts(event),
                "ra_id": event.get("id"),
                "ra_url": f"https://ra.co/events/{event.get('id')}",
            })

    return {
        "scraped_at": date.today().isoformat() + "T00:00:00Z",
        "cities": list(cities_map.values()),
    }
