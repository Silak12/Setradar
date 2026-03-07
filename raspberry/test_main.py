"""
Test-Version von main.py:
- Kein Startup-Delay
- Kein Schlafzeit-Check
- Genau 2 Mini-Sessions (6-14 Shots), dann post_process + Ende
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
from main import start_instagram_fresh, check_stories_with_retry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
log = logging.getLogger("test_main")

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
with open("config.yaml") as f:
    cfg = yaml.safe_load(f)
cfg["DRIVE_FOLDER_ID"] = os.getenv("DRIVE_FOLDER_ID", "")

TEST_SESSIONS  = 2
SHOTS_MIN      = 6
SHOTS_MAX      = 14
PAUSE_MIN      = 20
PAUSE_MAX      = 30

device  = u2.connect()
device.screen_on()
human   = HumanBehavior(device, cfg)
vision  = StoryVision()
stories = StoryCapture(device, vision, human, cfg)

if not start_instagram_fresh(device, log):
    exit(1)

total          = 0
need_scroll_up = False

for n in range(1, TEST_SESSIONS + 1):
    log.info(f"=== Test-Session {n}/{TEST_SESSIONS} ===")

    # Nach oben + aktualisieren (beim ersten Mal nur refresh, danach scroll+refresh)
    if need_scroll_up:
        human.scroll_to_top_and_refresh()
        need_scroll_up = False
    else:
        human.pull_to_refresh()

    # Stories checken – mit zweistufigem Retry wie in main.py
    img = vision.screenshot_to_numpy(device)
    if img is None or not vision.has_unseen_stories(img):
        if not check_stories_with_retry(device, vision, human, log):
            device.app_stop("com.instagram.android")
            log.info("Keine Stories gefunden – breche Test ab")
            break
        img = vision.screenshot_to_numpy(device)

    shots = random.randint(SHOTS_MIN, SHOTS_MAX)
    log.info(f"Session {n}: max {shots} Shots")
    count = stories.run_mini_session(max_shots=shots)
    total += count
    log.info(f"Session {n}: {count} Shots (gesamt {total})")

    # Pause + Feed-Scroll zwischen Sessions (nicht nach der letzten)
    if n < TEST_SESSIONS:
        human.scroll_feed_light()
        need_scroll_up = True
        pause = random.uniform(PAUSE_MIN, PAUSE_MAX)
        log.info(f"Pause {pause:.0f}s...")
        time.sleep(pause)

log.info(f"=== Test fertig: {total} Shots in {min(n, TEST_SESSIONS)} Sessions ===")
device.screen_off()

# Post-Processing wie in main.py
log.info("Starte post_process.py...")
try:
    import post_process
    post_process.main()
except Exception as e:
    log.error(f"post_process fehlgeschlagen: {e}", exc_info=True)
