from datetime import date
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


def build_lineup_json(venues_cfg: list[dict], scraped: dict[int, list[dict]]) -> dict:
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
            city["clubs"].append(club)

        for event in (scraped.get(venue_id) or []):
            club["events"].append({
                "date": (event.get("date") or "")[:10],
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
