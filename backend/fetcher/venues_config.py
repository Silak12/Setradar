import json
from pathlib import Path


class VenuesConfigError(ValueError):
    pass


VENUES_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "venues.json"


def _require_non_empty_string(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise VenuesConfigError(f"Field '{field_name}' muss ein nicht-leerer String sein.")
    return value.strip()


def _require_int(value: object, field_name: str) -> int:
    if not isinstance(value, int):
        raise VenuesConfigError(f"Field '{field_name}' muss ein Integer sein.")
    return value


def load_venues_config() -> list[dict]:
    if not VENUES_CONFIG_PATH.exists():
        raise VenuesConfigError(f"Config-Datei nicht gefunden: {VENUES_CONFIG_PATH}")

    try:
        raw_config = json.loads(VENUES_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise VenuesConfigError(
            f"Ungueltiges JSON in {VENUES_CONFIG_PATH}: Zeile {exc.lineno}, Spalte {exc.colno}"
        ) from exc

    if not isinstance(raw_config, list):
        raise VenuesConfigError("Top-Level in venues.json muss eine Liste sein.")

    venues: list[dict] = []
    seen_venue_ids: set[int] = set()

    for city_index, city_cfg in enumerate(raw_config):
        if not isinstance(city_cfg, dict):
            raise VenuesConfigError(f"Eintrag #{city_index} muss ein Objekt sein.")

        city_name = _require_non_empty_string(city_cfg.get("city"), f"[{city_index}].city")
        area_id = _require_int(city_cfg.get("area_id"), f"[{city_index}].area_id")
        clubs = city_cfg.get("clubs")

        if not isinstance(clubs, list) or not clubs:
            raise VenuesConfigError(f"Field '[{city_index}].clubs' muss eine nicht-leere Liste sein.")

        for club_index, club_cfg in enumerate(clubs):
            if not isinstance(club_cfg, dict):
                raise VenuesConfigError(
                    f"Eintrag '[{city_index}].clubs[{club_index}]' muss ein Objekt sein."
                )

            club_name = _require_non_empty_string(
                club_cfg.get("club"), f"[{city_index}].clubs[{club_index}].club"
            )
            venue_id = _require_int(
                club_cfg.get("venue_id"), f"[{city_index}].clubs[{club_index}].venue_id"
            )

            if venue_id in seen_venue_ids:
                raise VenuesConfigError(f"Doppelte venue_id gefunden: {venue_id}")
            seen_venue_ids.add(venue_id)

            venues.append({
                "city": city_name,
                "area_id": area_id,
                "club": club_name,
                "venue_id": venue_id,
            })

    if not venues:
        raise VenuesConfigError("Keine Venues in venues.json gefunden.")

    return venues
