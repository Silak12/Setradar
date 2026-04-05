import logging

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
