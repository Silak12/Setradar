import time
import random
import logging
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger(__name__)


class StoryCapture:
    def __init__(self, device, vision, human, cfg):
        self.d = device
        self.v = vision
        self.h = human
        self.cfg = cfg
        self.output_dir = Path(cfg["screenshots"]["local_output_dir"])
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _save_screenshot(self, label="story"):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{label}_{ts}.png"
        filepath = self.output_dir / filename
        self.d.screenshot(str(filepath))
        log.info(f"Screenshot: {filename}")
        return str(filepath)

    def _is_story_open(self):
        """Erkennt ob gerade eine Story angezeigt wird (weiße Progress-Bar oben)."""
        img = self.v.screenshot_to_numpy(self.d)
        if img is None:
            return False
        # Samsung A15 (2340px): Status-Bar ~80px, Progress-Bar bei y=80-150
        scan = img[80:150, :]
        white_mask = cv2.inRange(scan, np.array([200, 200, 200]), np.array([255, 255, 255]))
        white_pixels = cv2.countNonZero(white_mask)
        log.debug(f"Story Progress-Bar weiße Pixel: {white_pixels}")
        return white_pixels > 100

    def process_story_bar(self, uploader=None):
        """
        Öffnet Instagram, scannt Story-Leiste,
        screenshottet alle ungesehenen Stories.
        """
        # Instagram öffnen & auf Home sicherstellen
        self.d.app_start("com.instagram.android")
        self.h.delay(3, 5)

        try:
            self.d(description="Home").click()
            self.h.delay(2, 3)
        except Exception:
            pass  # Home bereits aktiv

        # Screenshot für Analyse
        img = self.v.screenshot_to_numpy(self.d)

        if not self.v.has_unseen_stories(img):
            log.info("Keine neuen Stories in der Leiste")
            return 0

        # Ersten roten Avatar antippen
        pos = self.v.find_first_story_avatar(img)
        if not pos:
            log.warning("Avatar nicht gefunden obwohl Stories erkannt")
            return 0

        log.info(f"Tippe Story-Avatar bei {pos}")
        self.d.click(pos[0], pos[1])
        self.h.delay(1.5, 2.5)

        # Alle Stories durchlaufen bis keine mehr offen
        total = 0
        max_stories = 200  # Sicherheits-Limit für 100-200 Accounts

        for i in range(max_stories):
            if not self._is_story_open():
                log.info(f"Alle Stories gesehen ({total} Screenshots)")
                break

            try:
                # 1. Screenshot
                filepath = self._save_screenshot("story")
                total += 1

                if uploader:
                    uploader.upload_async(filepath, "stories")

                # 2. Sofort nächste Story klicken
                self.d.click(0.85, 0.5)

                # 3. Kurz random warten
                self.h.delay(0.3, 1.5)

            except Exception as e:
                log.warning(f"Fehler bei Story {i}: {e}")
                try:
                    cur = self.d.app_current()
                    if "instagram" not in cur.get("package", "").lower():
                        log.error("Instagram gecrasht – breche Story-Loop ab")
                        break
                except Exception:
                    log.error("Verbindung zum Phone verloren")
                    break

        return total