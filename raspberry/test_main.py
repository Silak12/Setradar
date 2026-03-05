"""
Test-Version von main.py:
- Kein Startup-Delay
- Kein Schlafzeit-Check
- Läuft nur 5 Minuten
"""
import time
import random
import logging
import os
import yaml
from pathlib import Path
from dotenv import load_dotenv

import uiautomator2 as u2

from bot.human import HumanBehavior
from bot.vision import StoryVision
from bot.stories import StoryCapture
from main import start_instagram_fresh

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
log = logging.getLogger("test_main")

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
with open("config.yaml") as f:
    cfg = yaml.safe_load(f)
cfg["DRIVE_FOLDER_ID"] = os.getenv("DRIVE_FOLDER_ID", "")

TEST_DURATION = 5 * 60  # 5 Minuten

device  = u2.connect()
device.screen_on()
human   = HumanBehavior(device, cfg)
vision  = StoryVision()
stories = StoryCapture(device, vision, human, cfg)

b = cfg["behavior"]
shots_min = b.get("mini_session_shots_min", 5)
shots_max = b.get("mini_session_shots_max", 10)
pause_min = b.get("mini_session_pause_min", 20)
pause_max = b.get("mini_session_pause_max", 60)

if not start_instagram_fresh(device, log):
    exit(1)

start          = time.time()
total          = 0
n              = 0
need_scroll_up = False  # True nachdem Feed runtergescrollt wurde

while time.time() - start < TEST_DURATION:
    remaining = (TEST_DURATION - (time.time() - start)) / 60
    log.info(f"[{remaining:.1f} Min übrig] {total} Shots")

    # Nur hochscrollen wenn wir vorher den Feed runtergescrollt haben
    if need_scroll_up:
        human.scroll_to_top_and_refresh()
        need_scroll_up = False
    else:
        human.pull_to_refresh()

    img = vision.screenshot_to_numpy(device)
    if img is None or not vision.has_unseen_stories(img):
        log.info("Keine Stories – schließe Instagram und beende Test")
        device.app_stop("com.instagram.android")
        break

    shots = random.randint(shots_min, shots_max)
    count = stories.run_mini_session(max_shots=shots)
    total += count
    n     += 1
    log.info(f"Mini-Session #{n}: {count} Shots (gesamt {total})")

    if random.random() < 0.75:
        human.scroll_feed_light()
        need_scroll_up = True

    time.sleep(random.uniform(pause_min, pause_max))

log.info(f"=== Test fertig: {total} Shots in {n} Mini-Sessions ===")
device.screen_off()
