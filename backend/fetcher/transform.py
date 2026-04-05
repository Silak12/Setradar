from datetime import date


def event_to_acts(event: dict) -> list[dict]:
    acts = []
    for artist in (event.get("artists") or []):
        name = (artist.get("name") or "").strip()
        if name:
            acts.append({
                "name": name,
                "insta_name": "",
                "start_time": None,
                "end_time": None,
            })
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
                "acts": event_to_acts(event),
                "ra_id": event.get("id"),
                "ra_url": f"https://ra.co/events/{event.get('id')}",
            })

    return {
        "scraped_at": date.today().isoformat() + "T00:00:00Z",
        "cities": list(cities_map.values()),
    }
