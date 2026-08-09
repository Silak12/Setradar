from collections import Counter
from datetime import date, timedelta

from backend.database.seed_event_hype import SEED_SOURCE, _build_seed_rows


def test_ra_interested_count_is_used_without_jitter() -> None:
    event_date = date.today() + timedelta(days=7)

    rows = _build_seed_rows(
        [
            {
                "id": 42,
                "event_date": event_date.isoformat(),
                "interested_count": 273,
            }
        ],
        Counter({42: 5}),
    )

    assert rows == [
        {
            "event_id": 42,
            "seed_count": 273,
            "source": SEED_SOURCE,
        }
    ]


def test_ra_interested_count_is_clamped_to_zero() -> None:
    event_date = date.today() + timedelta(days=1)

    rows = _build_seed_rows(
        [
            {
                "id": 7,
                "event_date": event_date.isoformat(),
                "interested_count": -3,
            }
        ],
        Counter(),
    )

    assert rows[0]["seed_count"] == 0
