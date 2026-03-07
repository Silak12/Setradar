import time
import random
import logging
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger(__name__)


def _next_story_tap():
    """
    Zufälliger Tipp-Punkt für 'nächste Story'.
    X: weit rechts (0.87–0.96).
    Y: oberes oder unteres Drittel – NICHT Mitte (0.35–0.65),
       damit wir bei 'Suggested Accounts'-Screens keine Profile antippen.
    """
    x = random.uniform(0.87, 0.96)
    # Zufällig oben (0.12-0.32) oder unten (0.68-0.88)
    if random.random() < 0.5:
        y = random.uniform(0.12, 0.32)
    else:
        y = random.uniform(0.68, 0.88)
    return x, y


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

    def run_mini_session(self, uploader=None, max_shots=7):
        """
        Mini-Session: Ersten Story-Avatar antippen, max_shots Screenshots machen,
        dann zurück zum Feed. Setzt voraus dass Instagram auf dem Home-Feed ist.

        Stuck-Erkennung (Suggestion-Screen) ist live eingebaut.
        Dedup läuft offline via dedup.py.
        """
        img = self.v.screenshot_to_numpy(self.d)
        pos = self.v.find_first_story_avatar(img)
        if not pos:
            log.info("Kein Story-Avatar gefunden")
            return 0

        log.info(f"Mini-Session: Tippe Avatar bei {pos}, max {max_shots} Shots")
        self.d.click(pos[0], pos[1])
        self.h.delay(1.5, 2.5)

        total = 0
        last_img = None
        stuck_count = 0

        for i in range(max_shots):
            if not self._is_story_open():
                log.info(f"Story-Viewer geschlossen nach {total} Shots")
                break

            try:
                img = self.v.screenshot_to_numpy(self.d)

                # Stuck-Erkennung (Suggestion-Screen, eingefroren)
                if last_img is not None:
                    diff = cv2.absdiff(img, last_img)
                    if diff.mean() / 255.0 < 0.02:
                        stuck_count += 1
                        log.warning(f"Bild identisch – stuck={stuck_count}")
                        if stuck_count >= 3:
                            log.warning("Feststeckend → Back")
                            self.d.press("back")
                            self.h.delay(1, 1.5)
                            return total
                        self.d.click(*_next_story_tap())
                        self.h.delay(0.3, 1.0)
                        continue
                    else:
                        stuck_count = 0
                last_img = img

                # Warten bis Text-Overlays / Einblend-Animationen fertig sind
                self.h.delay(0.5, 1.3)

                filepath = self._save_screenshot("story")
                total += 1

                if uploader:
                    uploader.upload_async(filepath, "stories")

                self.d.click(*_next_story_tap())
                self.h.delay(0.5, 2.0)

            except Exception as e:
                log.warning(f"Fehler bei Shot {i}: {e}")
                try:
                    if "instagram" not in self.d.app_current().get("package", "").lower():
                        log.error("Instagram gecrasht")
                        return total
                except Exception:
                    return total

        # Zurück zum Feed
        self.d.press("back")
        self.h.delay(0.5, 1.0)
        return total

    def process_story_bar(self, uploader=None):
        """
        Öffnet Instagram, scannt Story-Leiste,
        screenshottet alle ungesehenen Stories.
        """
        # Neu starten statt app_start → garantiert Home-Feed.
        # app_start behält den zuletzt geöffneten Tab (z.B. Reels).
        self.d.app_stop("com.instagram.android")
        self.h.delay(2, 3)
        self.d.app_start("com.instagram.android")
        self.h.delay(5, 7)

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
        skipped = 0
        last_img = None
        stuck_count = 0
        seen_hashes = []
        max_stories = 200

        for i in range(max_stories):
            if not self._is_story_open():
                log.info(f"Alle Stories gesehen ({total} neu, {skipped} Duplikate)")
                break

            try:
                img = self.v.screenshot_to_numpy(self.d)

                # ── Stuck-Erkennung ───────────────────────────────────────────
                if last_img is not None:
                    diff = cv2.absdiff(img, last_img)
                    if diff.mean() / 255.0 < 0.02:
                        stuck_count += 1
                        log.warning(f"Bild fast identisch – stuck={stuck_count}")
                        if stuck_count >= 3:
                            log.warning("Feststeckend (Suggestion-Screen?) → Back")
                            self.d.press("back")
                            self.h.delay(1, 1.5)
                            break
                        self.d.click(0.85, 0.5)
                        self.h.delay(0.3, 1.0)
                        continue
                    else:
                        stuck_count = 0
                last_img = img

                # ── Duplikat-Erkennung via Perceptual Hash ────────────────────
                thumb = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (16, 16))
                phash = (thumb > thumb.mean()).flatten()
                is_dup = any(
                    np.count_nonzero(phash != h) < 20
                    for h in seen_hashes
                )
                if is_dup:
                    skipped += 1
                    log.info(f"Duplikat übersprungen ({skipped} gesamt)")
                    self.d.click(0.85, 0.5)
                    self.h.delay(0.3, 1.0)
                    continue
                seen_hashes.append(phash)

                filepath = self._save_screenshot("story")
                total += 1

                if uploader:
                    uploader.upload_async(filepath, "stories")

                self.d.click(0.85, 0.5)
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

        # Nach Story-Loop zurück zum Feed
        self.d.press("back")
        self.h.delay(0.5, 1.0)

        return total