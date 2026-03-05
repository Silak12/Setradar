import time
import random
import logging
from datetime import datetime

log = logging.getLogger(__name__)


class HumanBehavior:
    def __init__(self, device, cfg):
        self.d = device
        self.cfg = cfg["behavior"]
        self.session_start = time.time()

    # ── Zufälliger Delay ──────────────────────────────────────────
    def delay(self, min_s=None, max_s=None):
        lo = min_s or self.cfg["delay_min"]
        hi = max_s or self.cfg["delay_max"]
        t = random.uniform(lo, hi)

        # Manchmal "nachdenken"
        if random.random() < self.cfg["deep_pause_chance"]:
            t += random.uniform(5, 15)
            log.debug(f"Deep pause: +{t:.1f}s")

        time.sleep(t)

    # ── Session-Limit erreicht? ───────────────────────────────────
    def should_break(self):
        elapsed = time.time() - self.session_start
        limit = random.uniform(
            self.cfg["session_duration_min"] * 60,
            self.cfg["session_duration_max"] * 60
        )
        return elapsed > limit

    # ── Pause machen ─────────────────────────────────────────────
    def take_break(self):
        duration = random.uniform(
            self.cfg["break_duration_min"] * 60,
            self.cfg["break_duration_max"] * 60
        )
        log.info(f"Break: {duration/60:.0f} Minuten")

        self.d.app_stop("com.instagram.android")

        if random.random() < 0.7:
            self.d.screen_off()

        time.sleep(duration)
        self.d.screen_on()
        self.session_start = time.time()

    # ── Nachtruhe? ───────────────────────────────────────────────
    def is_sleep_time(self):
        now = datetime.now()
        now_min = now.hour * 60 + now.minute

        def to_min(val):
            if isinstance(val, str) and ":" in val:
                h, m = val.split(":")
                return int(h) * 60 + int(m)
            return int(val) * 60

        start = to_min(self.cfg.get("sleep_start", "0:30"))
        end   = to_min(self.cfg.get("sleep_end",   "10:00"))
        if start < end:
            return start <= now_min < end
        return now_min >= start or now_min < end

    # ── Feed scrollen zwischen Mini-Sessions ─────────────────────
    def scroll_feed_light(self):
        """
        Leichtes Scrollen auf dem aktuellen Screen (kein Tab-Klick).
        Setzt voraus dass Instagram bereits auf dem Feed ist.
        """
        scrolls = random.randint(3, 8)
        log.debug(f"Feed: {scrolls} Scrolls")
        for _ in range(scrolls):
            speed = random.uniform(0.3, 0.9)
            self.d.swipe(0.5, 0.72, 0.5, 0.28, duration=speed)
            self.delay(1.5, 5.0)
            if random.random() < 0.15:
                time.sleep(random.uniform(3, 10))