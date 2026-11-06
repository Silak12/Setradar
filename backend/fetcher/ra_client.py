import logging
import time
from datetime import date

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LOGGER = logging.getLogger(__name__)

RA_GRAPHQL_URL = "https://ra.co/graphql"
DEFAULT_TIMEOUT = 15

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Referer": "https://ra.co/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "ra-content-language": "de",
}

_SESSION: requests.Session | None = None


def _build_session(retries: int = 3, backoff_factor: float = 1.0) -> requests.Session:
    retry_cfg = Retry(
        total=retries,
        connect=retries,
        read=retries,
        status=retries,
        backoff_factor=backoff_factor,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["POST"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry_cfg)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _get_session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = _build_session()
    return _SESSION


def gql(query: str, variables: dict, timeout: int = DEFAULT_TIMEOUT) -> dict:
    payload = {"query": query, "variables": variables}
    try:
        resp = _get_session().post(RA_GRAPHQL_URL, headers=HEADERS, json=payload, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            msgs = [e.get("message", "") for e in data["errors"]]
            LOGGER.warning("[GQL Errors] %s", msgs)
        return data
    except requests.RequestException as exc:
        LOGGER.error("Request-Fehler: %s", exc)
        return {}


def fetch_venue_listing(
    query: str,
    venue_id: int,
    *,
    initial_limit: int = 100,
    max_limit: int = 3200,
) -> list[dict]:
    """Fetch a complete LATEST listing, expanding the limit when it fills up.

    Both scrapers use these listings to deactivate missing events. Missing,
    malformed or partially failed responses must never count as an empty list.
    """
    if not 1 <= initial_limit <= max_limit:
        raise ValueError("Expected 1 <= initial_limit <= max_limit")

    limit = initial_limit
    while True:
        data = gql(query, {"id": venue_id, "limit": limit})
        if not data or data.get("errors"):
            raise RuntimeError(f"RA lieferte keine vollstaendige Antwort fuer venue_id={venue_id}")
        venue = (data.get("data") or {}).get("venue")
        events = venue.get("events") if isinstance(venue, dict) else None
        if isinstance(events, dict):
            events = events.get("data")
        if not isinstance(events, list):
            raise RuntimeError(f"RA lieferte keine Event-Liste fuer venue_id={venue_id}")
        for event in events:
            if not isinstance(event, dict) or not str(event.get("id") or "").strip():
                raise RuntimeError(f"RA lieferte ein Event ohne Identitaet fuer venue_id={venue_id}")
            try:
                date.fromisoformat(str(event.get("date") or "")[:10])
            except ValueError as exc:
                raise RuntimeError(
                    f"RA lieferte ein Event ohne gueltiges Datum fuer venue_id={venue_id}"
                ) from exc
        LOGGER.info("  RA venue_id=%s: %s Event(s), Limit %s", venue_id, len(events), limit)
        if len(events) < limit:
            return events
        if limit >= max_limit:
            raise RuntimeError(
                f"RA Event-Limit fuer venue_id={venue_id} erreicht ({limit}); "
                "Snapshot waere moeglicherweise unvollstaendig."
            )
        limit = min(limit * 2, max_limit)
        LOGGER.info("  Erhoehe RA Event-Limit fuer venue_id=%s auf %s", venue_id, limit)
        time.sleep(1)
