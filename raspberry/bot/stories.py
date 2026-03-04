import time
import random
import logging
import os
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)


class StoryCapture:
    def __init__(self, device, vision, human, cfg):
        self.d = device
        self.v = vision
        self.h = human
        self.cfg = cfg
        self.output_dir = Path(cfg["screenshots"]["local_output_dir"])
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _save_screenshot(self, account_name):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{account_name}_{ts}.png"
        filepath = self.output_dir / filename
        self.d.screenshot(str(filepath))
        log.info(f"Screenshot: {filename}")
        return str(filepath)

    def open_story_of_account(self, account_name):
        """Öffnet das Profil eines Accounts und klickt den Story-Ring an."""
        log.info(f"Öffne Story: @{account_name}")

        # Profil via Suche öffnen
        self.d.app_start("com.instagram.android")
        self.h.delay(2, 3)

        # Such-Tab
        self.d(description="Search and explore").click()
        self.h.delay(1, 2)

        # Suchfeld
        self.d(resourceId="com.instagram.android:id/action_bar_search_edit_text").click()
        self.h.delay(0.5, 1)
        self.d.send_keys(account_name)
        self.h.delay(1.5, 2.5)

        # Ersten Treffer anklicken
        try:
            self.d(resourceId="com.instagram.android:id/row_search_user_username"
                   ).click()
        except Exception:
            log.warning(f"Account {account_name} nicht gefunden")
            return False

        self.h.delay(1.5, 2.5)

        # Story-Ring antippen (oben links im Profil)
        self.d.click(0.18, 0.22)
        self.h.delay(1, 2)
        return True

    def capture_all_stories_of_account(self, account_name, uploader=None):
        """
        Öffnet alle Stories eines Accounts, screenshottet jede einzelne
        und lädt sie hoch.
        """
        if not self.open_story_of_account(account_name):
            return 0

        captured = 0
        max_stories = 50  # Sicherheits-Limit

        for i in range(max_stories):
            img = self.v.screenshot_to_numpy(self.d)

            # Prüfe ob wir noch in einer Story sind
            if not self._is_story_open(img):
                log.info(f"@{account_name}: alle Stories gesehen ({captured} Stk)")
                break

            # Screenshot machen
            filepath = self._save_screenshot(account_name)
            captured += 1

            # Upload
            if uploader:
                uploader.upload_async(filepath, account_name)

            self.h.delay(1.2, 3.0)

            # Zur nächsten Story wischen
            self.d.click(0.85, 0.5)
            self.h.delay(0.8, 1.8)

        return captured

    def _is_story_open(self, img):
        """Erkennt ob gerade eine Story angezeigt wird."""
        if img is None:
            return False

        h, w = img.shape[:2]
        # Story-Progress-Bar = sehr oben, heller Bereich
        top_strip = img[0:8, :]
        brightness = top_strip.mean()
        return brightness > 180

    def process_story_bar(self, uploader=None):
        """
        Schaut auf die Story-Leiste im Feed,
        öffnet alle Accounts mit rotem Ring.
        """
        self.d.app_start("com.instagram.android")
        self.h.delay(2, 4)

        # Home-Tab
        self.d(description="Home").click()
        self.h.delay(1, 2)

        img = self.v.screenshot_to_numpy(self.d)

        if not self.v.has_unseen_stories(img):
            log.info("Keine neuen Stories in der Leiste")
            return 0

        # Ersten roten Avatar antippen
        pos = self.v.find_first_story_avatar(img)
        if pos:
            self.d.click(pos[0], pos[1])
            self.h.delay(1, 2)

        total = 0
        # Jetzt durch alle Stories navigieren bis alles grau
        max_accounts = 50
        for _ in range(max_accounts):
            img = self.v.screenshot_to_numpy(self.d)

            if not self._is_story_open(img):
                break

            # Screenshot
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filepath = self.output_dir / f"feed_story_{ts}.png"
            self.d.screenshot(str(filepath))
            total += 1

            if uploader:
                uploader.upload_async(str(filepath), "feed")

            self.h.delay(1.5, 3.5)
            self.d.click(0.85, 0.5)
            self.h.delay(0.8, 1.5)

        return total