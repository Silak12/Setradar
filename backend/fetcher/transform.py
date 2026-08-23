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


# ── Lineup-Text-Parsing ───────────────────────────────────────────────────────
#
# RA verlinkt nur Artists mit Profil (`artists[]` bzw. <artist>-Tags im
# lineup-Feld). Acts ohne RA-Profil stehen als reiner Text im Lineup und
# fehlten frueher komplett. Der Parser holt sie nach und filtert Junk
# (Sektions-Header, Ticket-Hinweise, Zeiten, lose Set-Deskriptoren).

_ARTIST_TAG_RE = re.compile(r"<artist\b[^>]*>(.*?)</artist>", re.IGNORECASE | re.DOTALL)
_MARKUP_RE = re.compile(r"<[^>]+>")
_TIME_TOKEN_RE = re.compile(r"\d{1,2}[:.]\d{2}")
_SET_SUFFIX_RE = re.compile(
    r"\s*\(\s*[^)]*\b(?:live|set|dj|b2b|b3b|hybrid|showcase|all\s*night|extended)\b[^)]*\)\s*$",
    re.IGNORECASE,
)
_LINEUP_SPLIT_RE = re.compile(r"[\n\r\u2028\u2029,;]+|\s+b[23]b\s+", re.IGNORECASE)
_PAREN_RE = re.compile(r"\([^)]*\)")
_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)

# Woerter, die auf Nicht-Act-Zeilen hindeuten. Eine Zeile fliegt nur raus,
# wenn ALLE ihre Woerter Junk (oder reine Zahlen) sind — "The Shredder"
# ueberlebt, "SATURDAY DAY OPEN AIR" nicht.
_LINEUP_JUNK_TOKENS = frozenset("""
    monday tuesday wednesday thursday friday saturday sunday
    montag dienstag mittwoch donnerstag freitag samstag sonntag
    day night indoor outdoor open air floor stage room basement main
    garden garten terrasse rooftop
    part parts ticket tickets tba tbc lineup line up doors entry
    info infos important notice instagram capacity person secure per
    and und with mit more many uhr pm am till until from bis ab
    hosted presents pres invites b2b b3b vs feat ft
""".split())


def _clean_lineup_segment(segment: str) -> str:
    name = segment.strip().strip("-\u2013\u2014\u2022\u00b7|: ").strip()
    return _SET_SUFFIX_RE.sub("", name).strip()


def _is_probable_act_name(name: str) -> bool:
    if len(name) < 2 or len(name) > 40:
        return False
    if _TIME_TOKEN_RE.search(name):
        return False
    tokens = _WORD_RE.findall(name.lower())
    if not tokens or len(tokens) > 4:
        return False
    return any(token not in _LINEUP_JUNK_TOKENS and not token.isdigit() for token in tokens)


def _act_dedupe_key(name: str) -> str:
    """Gleicher Artist trotz RA-Suffixen: 'NOTMYTYPE (2)' == 'NOTMYTYPE(Bounce Set)'."""
    return _normalize_event_title(_PAREN_RE.sub(" ", name))


def _lineup_text_acts(raw_lineup: str | None) -> list[str]:
    """Alle plausiblen Act-Namen aus dem lineup-Feld, in Textreihenfolge."""
    if not raw_lineup:
        return []
    text = _ARTIST_TAG_RE.sub(lambda m: "\n" + m.group(1) + "\n", str(raw_lineup))
    text = _MARKUP_RE.sub("\n", text)
    names = []
    for segment in _LINEUP_SPLIT_RE.split(text):
        name = _clean_lineup_segment(segment)
        if name and _is_probable_act_name(name):
            names.append(name)
    return names


def _empty_socials_act(name: str) -> dict:
    return {
        "name": name,
        "insta_name": "",
        "insta_url": "",
        "soundcloud_name": "",
        "soundcloud_url": "",
        "start_time": None,
        "end_time": None,
    }


def event_to_acts(event: dict) -> list[dict]:
    acts = []
    seen: set[str] = set()
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
            seen.add(_act_dedupe_key(name))

    # Unverlinkte Acts aus dem Lineup-Text nachziehen (bzw. kompletter
    # Fallback, wenn RA gar keine artists[] liefert).
    for name in _lineup_text_acts(event.get("lineup")):
        key = _act_dedupe_key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        acts.append(_empty_socials_act(name))
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


def _event_span(event: dict) -> tuple[str, str] | None:
    """Return the (start, end) of an event as comparable ISO timestamps."""
    event_date = parse_date(event.get("date"))
    if not event_date:
        return None
    end_date = get_event_end_date(event) or event_date
    start_time = parse_time(event.get("startTime")) or "00:00"
    end_time = parse_time(event.get("endTime")) or "23:59"
    return f"{event_date}T{start_time}", f"{end_date}T{end_time}"


def _spans_overlap(first: dict, second: dict) -> bool:
    first_span = _event_span(first)
    second_span = _event_span(second)
    if not first_span or not second_span:
        return False
    return first_span[0] < second_span[1] and second_span[0] < first_span[1]


def _act_name_set(event: dict) -> frozenset[str]:
    return frozenset(
        _normalize_event_title(act["name"])
        for act in event_to_acts(event)
        if _normalize_event_title(act["name"])
    )


def _richness(event: dict) -> tuple[int, int, tuple[int, str]]:
    interested = event.get("interestedCount")
    try:
        interested = int(interested or 0)
    except (TypeError, ValueError):
        interested = 0
    return (len(_act_name_set(event)), interested, _ra_id_sort_key(event))


def _is_shadow_listing(candidate: dict, primary: dict) -> bool:
    """
    Detect a secondary RA listing that duplicates ``primary`` on the same venue
    and day, e.g. a stub an artist created for their own slot ("Euphorik",
    lineup "Limoncello", no promoter) next to the promoter's official listing
    ("EUPHORIK x CYCLE pres. ...", 15 artists). Such stubs share the day, overlap
    in time and announce a subset of the official lineup. To stay conservative
    the titles must also be related (one contains the other) unless RA marks
    the candidate as promoter-less.
    """
    if candidate is primary:
        return False
    if parse_date(candidate.get("date")) != parse_date(primary.get("date")):
        return False
    if not _spans_overlap(candidate, primary):
        return False

    candidate_acts = _act_name_set(candidate)
    primary_acts = _act_name_set(primary)
    if not candidate_acts or not candidate_acts <= primary_acts:
        return False
    if _richness(candidate) >= _richness(primary):
        return False

    candidate_title = _normalize_event_title(candidate.get("title"))
    primary_title = _normalize_event_title(primary.get("title"))
    titles_related = bool(candidate_title) and bool(primary_title) and (
        candidate_title == primary_title
        or (len(candidate_title) >= 6 and candidate_title in primary_title)
        or (len(primary_title) >= 6 and primary_title in candidate_title)
    )
    promoters = candidate.get("promoters")
    promoter_less = isinstance(promoters, list) and not promoters
    return titles_related or promoter_less


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

    # Second pass: drop stub listings that merely shadow a richer listing of
    # the same night. Richness is strictly ordered, so two listings can never
    # absorb each other.
    return [
        event
        for event in result
        if not any(_is_shadow_listing(event, primary) for primary in result)
    ]


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
