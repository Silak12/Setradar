"""
Test-Version von main.py:
- Kein Startup-Delay, kein Schlafzeit-Check
- Wartezeiten gekappt (App-Starts: 2s, kurze Waits: 1.5s)
- Instagram-Neustart nach jeder Session → sicher auf Home Feed
- Genau 2 Mini-Sessions, dann post_process + Ende
"""
import time
from time import sleep as _original_sleep
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

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
log = logging.getLogger("test_main")

load_dotenv(dotenv_path=ROOT_DIR / ".env")
with (BASE_DIR / "config.yaml").open("r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)
cfg["DRIVE_FOLDER_ID"] = os.getenv("DRIVE_FOLDER_ID", "")

TEST_SESSIONS = 2
SHOTS_MIN     = 6
SHOTS_MAX     = 14

device  = u2.connect()
device.screen_on()
human   = HumanBehavior(device, cfg)
vision  = StoryVision()
stories = StoryCapture(device, vision, human, cfg)

# Instagram mit echten Wartezeiten starten
if not start_instagram_fresh(device, log):
    exit(1)

# ── Ab hier: Wartezeiten kappen ───────────────────────────────────────────────
# App-Start-Waits (>3s) auf 2s kappen,
# kurze Waits (≤3s) auf 1.5s – Story-Viewer braucht ~1s zum Öffnen
def _fast_sleep(seconds):
    if seconds > 3:
        _original_sleep(2.0)
    else:
        _original_sleep(min(seconds, 1.5))

time.sleep = _fast_sleep

total         = 0
mini_sessions = 0

for n in range(1, TEST_SESSIONS + 1):
    log.info(f"=== Test-Session {n}/{TEST_SESSIONS} ===")

    # Nach jeder Session (außer der ersten) Instagram neu starten → sicher auf Home Feed
    if n > 1:
        start_instagram_fresh(device, log)

    img = vision.screenshot_to_numpy(device)
    if img is None or not vision.has_unseen_stories(img):
        if not check_stories_with_retry(device, vision, human, log):
            device.app_stop("com.instagram.android")
            log.info("Keine Stories – breche Test ab")
            break
        img = vision.screenshot_to_numpy(device)

    followed, suggested, total = vision.count_story_avatars(img)
    log.info(f"Avatare: {total} gesamt – {followed} followed, {suggested} suggested")

    if total == 0 or (suggested == total and total > 0):
        log.info("Nur noch suggested Stories – beende Test")
        device.app_stop("com.instagram.android")
        break

    if followed <= 2:
        shots = random.randint(8, 10)
        log.info(f"Nur noch {followed} followed – {shots} Shots")
    else:
        shots = random.randint(SHOTS_MIN, SHOTS_MAX)

    log.info(f"Session {n}: max {shots} Shots")
    count = stories.run_mini_session(max_shots=shots)
    total         += count
    mini_sessions += 1
    log.info(f"Session {n}: {count} Shots (gesamt {total})")

log.info(f"=== Test fertig: {total} Shots in {mini_sessions} Sessions ===")

log.info("Starte post_process.py...")
try:
    import post_process
    post_process.main()
except Exception as e:
    log.error(f"post_process fehlgeschlagen: {e}", exc_info=True)
