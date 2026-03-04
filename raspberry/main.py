import time
import random
import logging
import logging.handlers
import os
import yaml
from pathlib import Path
from dotenv import load_dotenv

import uiautomator2 as u2

from bot.human import HumanBehavior
from bot.vision import StoryVision
from bot.stories import StoryCapture
from bot.uploader import DriveUploader


def setup_logging(cfg):
    Path("logs").mkdir(exist_ok=True)
    level = getattr(logging, cfg["logging"]["level"])
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(level=level, format=fmt)
    fh = logging.handlers.RotatingFileHandler(
        cfg["logging"]["log_file"], maxBytes=5_000_000, backupCount=3)
    fh.setFormatter(logging.Formatter(fmt))
    logging.getLogger().addHandler(fh)


def load_config():
    # .env aus Root laden
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

    with open("config.yaml", "r") as f:
        cfg = yaml.safe_load(f)

    folder_id = os.getenv("DRIVE_FOLDER_ID", "")
    if not folder_id:
        raise ValueError("DRIVE_FOLDER_ID fehlt in .env!")

    cfg["DRIVE_FOLDER_ID"] = folder_id
    return cfg


def connect_device(cfg):
    device_id = cfg.get("adb_device", "")
    return u2.connect(device_id) if device_id else u2.connect()


def main():
    cfg = load_config()
    setup_logging(cfg)
    log = logging.getLogger("main")

    log.info("=== Instagram Story Bot gestartet ===")

    device = connect_device(cfg)
    device.screen_on()
    log.info(f"Phone verbunden: {device.device_info}")

    human    = HumanBehavior(device, cfg)
    vision   = StoryVision()
    stories  = StoryCapture(device, vision, human, cfg)
    uploader = DriveUploader(cfg["DRIVE_FOLDER_ID"])

    while True:
        try:
            if human.is_sleep_time():
                log.info("Nachtruhe – schlafe 30 Min")
                device.screen_off()
                time.sleep(30 * 60)
                continue

            if human.should_break():
                log.info("Session-Limit → Pause")
                human.take_break()
                continue

            if random.random() < cfg["behavior"]["feed_scroll_chance"]:
                human.scroll_feed()
                human.delay(2, 5)
                continue

            log.info("Story-Leiste wird abgescannt...")
            count = stories.process_story_bar(uploader)
            log.info(f"{count} Stories gespeichert")

            if count == 0:
                wait = random.uniform(10 * 60, 25 * 60)
                log.info(f"Keine neuen Stories – warte {wait/60:.0f} Min")
                time.sleep(wait)
            else:
                human.delay(60, 180)

        except KeyboardInterrupt:
            log.info("Bot gestoppt")
            break
        except Exception as e:
            log.error(f"Fehler: {e}", exc_info=True)
            time.sleep(30)


if __name__ == "__main__":
    main()