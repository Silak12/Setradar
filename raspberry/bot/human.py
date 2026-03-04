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
        hour = datetime.now().hour
        start = self.cfg["sleep_start_hour"]
        end = self.cfg["sleep_end_hour"]
        return start <= hour < end

    # ── Feed scrollen (Tarnung) ───────────────────────────────────
    def scroll_feed(self):
        log.info("Feed scrollen...")
        self.d.app_start("com.instagram.android")
        self.delay(2, 4)

        # Home-Tab antippen
        self.d(description="Home").click()
        self.delay(1, 2)

        scrolls = random.randint(4, 14)
        for _ in range(scrolls):
            speed = random.uniform(0.3, 1.0)
            self.d.swipe(0.5, 0.72, 0.5, 0.28, duration=speed)
            self.delay(2, 7)

            # Manchmal kurz bei einem Post hängen bleiben
            if random.random() < 0.25:
                time.sleep(random.uniform(5, 15))

        log.info(f"Feed: {scrolls} Scrolls")