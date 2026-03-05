"""
Schneller Story-Test ohne Feed-Scrolling.
Starte direkt: python test_stories.py

Macht:
1. Instagram öffnen + Home-Tab
2. Screenshot + Debug-Bilder speichern
3. Detaillierte Analyse der Story-Leiste (HSV-Werte, Pixel-Counts)
4. Falls Stories erkannt → Avatar antippen + alle Stories screenshotten
"""
import time
import random
import logging
import sys
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np
import uiautomator2 as u2

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("test_stories")

# ── Einstellungen ─────────────────────────────────────────────────────────────
OUTPUT_DIR = Path("./test_captures")
OUTPUT_DIR.mkdir(exist_ok=True)

# Nur oberer Ring-Bogen der Story-Avatare (Samsung A15, 1080x2340px)
STORY_BAR_Y1 = 237
STORY_BAR_Y2 = 268
STORY_BAR_CENTER_Y = 305  # Avatar-Mittelpunkt zum Anklicken

MAX_STORIES = 50


# ── Helpers ───────────────────────────────────────────────────────────────────

def ts():
    return datetime.now().strftime("%H%M%S_%f")


def save(img, name):
    path = str(OUTPUT_DIR / f"{name}_{ts()}.png")
    cv2.imwrite(path, img)
    log.info(f"  Gespeichert: {path}")
    return path


def _gradient_masks(hsv):
    rot_a  = cv2.inRange(hsv, np.array([0,   120, 120]), np.array([10,  255, 255]))
    rot_b  = cv2.inRange(hsv, np.array([160, 120, 120]), np.array([180, 255, 255]))
    orange = cv2.inRange(hsv, np.array([10,  120, 120]), np.array([35,  255, 255]))
    lila   = cv2.inRange(hsv, np.array([130,  60, 120]), np.array([160, 255, 255]))
    return rot_a, rot_b, orange, lila


def analyze_story_bar(img):
    """Gibt detaillierte Debug-Infos zur Story-Leiste aus."""
    h, w = img.shape[:2]
    log.info(f"Bild: {w}x{h}px")
    log.info(f"Scan-Bereich: Y={STORY_BAR_Y1}-{STORY_BAR_Y2} (nur oberer Ring-Bogen)")

    bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
    hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

    rot_a, rot_b, orange, lila = _gradient_masks(hsv)
    counts = {
        "Rot   (H  0-10 + 160-180)": cv2.countNonZero(cv2.bitwise_or(rot_a, rot_b)),
        "Orange(H  10-35)          ": cv2.countNonZero(orange),
        "Lila  (H 130-160)         ": cv2.countNonZero(lila),
    }

    zones_active = 0
    for name, count in counts.items():
        active = count > 80
        if active:
            zones_active += 1
        log.info(f"  {name}: {count} Pixel {'✓' if active else '✗'}")

    found = zones_active >= 2
    log.info(f"  ─── Aktive Zonen: {zones_active}/3 → Stories: {'JA' if found else 'NEIN'}")
    log.info(f"  (Anti-FP: rotes Profilfoto = nur 1 Zone → kein Trigger)")

    all_masks = {"rot_a": rot_a, "rot_b": rot_b, "orange": orange, "lila": lila}
    return found, bar, all_masks


def find_first_avatar(img):
    h, w = img.shape[:2]
    bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
    hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)
    rot_a, rot_b, orange, lila = _gradient_masks(hsv)

    mask = cv2.bitwise_or(
        cv2.bitwise_or(rot_a, rot_b),
        cv2.bitwise_or(orange, lila)
    )

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    leftmost = min(contours, key=lambda c: cv2.boundingRect(c)[0])
    M = cv2.moments(leftmost)
    if M["m00"] == 0:
        return None

    # X aus Ring-Bogen, Y auf Avatar-Mittelpunkt setzen
    cx = int(M["m10"] / M["m00"])
    rel_x = cx / w
    rel_y = STORY_BAR_CENTER_Y / h
    log.info(f"Erster Avatar: Ring bei x={cx}px → klicke ({rel_x:.2f}, {rel_y:.2f})")
    return rel_x, rel_y


def is_story_open(d, debug_label=None):
    """
    Erkennt Story-Ansicht anhand der weißen Progress-Bar-Segmente oben.
    Scannt Y=80-150px und sucht nach hellen (weißen) Pixeln.
    """
    img = d.screenshot(format="opencv")
    if img is None:
        return False, img

    if debug_label:
        save(img, debug_label)

    # Auf dem Samsung A15 (2340px): Status-Bar ~80px, Progress-Bar ~80-150px
    scan_region = img[80:150, :]
    # Nur sehr helle Pixel (weiße Segmente der Progress-Bar)
    white_mask = cv2.inRange(scan_region, np.array([200, 200, 200]), np.array([255, 255, 255]))
    white_pixels = cv2.countNonZero(white_mask)

    # Alternativ: Durchschnittshelligkeit
    brightness = scan_region.mean()
    log.debug(f"Story-Check: weiße Pixel={white_pixels}, Helligkeit={brightness:.1f}")

    return white_pixels > 100, img


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("=== Story-Test gestartet ===")

    d = u2.connect()
    d.screen_on()
    info = d.device_info
    log.info(f"Verbunden: {info['brand']} {info['model']} (Android {info['version']})")

    # Instagram neu starten → garantiert Home-Feed (app_start behält letzten Tab)
    log.info("Starte Instagram neu (garantierter Home-Feed)...")
    d.app_stop("com.instagram.android")
    time.sleep(2)
    d.app_start("com.instagram.android")
    time.sleep(6)

    cur_app = d.app_current()
    log.info(f"Aktive App: {cur_app}")
    if "instagram" not in cur_app.get("package", "").lower():
        log.error("Instagram startet nicht – Abbruch")
        return

    time.sleep(1)

    # Screenshot + Debug
    log.info("Mache Screenshot...")
    raw = d.screenshot(format="opencv")
    save(raw, "debug_home")

    # Story-Leiste Debug-Bild
    bar_img = raw[STORY_BAR_Y1:STORY_BAR_Y2, :]
    save(bar_img, "debug_storybar")

    # Analyse
    log.info("── Story-Leiste Analyse ──")
    found, bar, masks = analyze_story_bar(raw)

    # Debug: Maske als Bild speichern
    combined_mask = np.zeros(bar.shape[:2], dtype=np.uint8)
    for m in masks.values():
        combined_mask = cv2.bitwise_or(combined_mask, m)
    save(cv2.cvtColor(combined_mask, cv2.COLOR_GRAY2BGR), "debug_mask")

    if not found:
        log.warning("KEINE Stories erkannt. Prüfe die debug_* Bilder.")
        log.warning(f"Überprüfe ob STORY_BAR_Y1={STORY_BAR_Y1} und STORY_BAR_Y2={STORY_BAR_Y2} stimmen.")
        return

    log.info("Stories erkannt!")

    pos = find_first_avatar(raw)
    if not pos:
        log.error("Avatar-Position nicht gefunden trotz erkannter Stories.")
        return

    log.info(f"Klicke Avatar bei ({pos[0]:.2f}, {pos[1]:.2f})...")
    d.click(pos[0], pos[1])
    time.sleep(2)

    # Sofort debug-Screenshot machen um zu sehen was nach dem Klick passiert ist
    open_now, dbg = is_story_open(d, debug_label="after_click")
    log.info(f"Story offen nach Klick: {open_now}")

    if not open_now:
        log.warning("Story hat sich nicht geöffnet! Prüfe after_click_*.png")
        log.warning("Mögliche Ursachen: falscher Avatar-Pixel, Instagram-Overlay, Crash")
        return

    # Stories durchlaufen
    count = 0
    skipped = 0
    last_img = None
    stuck_count = 0
    seen_hashes = []
    log.info("Starte Story-Capture...")

    for i in range(MAX_STORIES):
        open_now, _ = is_story_open(d)
        if not open_now:
            log.info(f"Keine Story mehr offen nach {count} Screenshots ({skipped} Duplikate übersprungen).")
            break

        try:
            img = d.screenshot(format="opencv")

            # ── Stuck-Erkennung (Suggestion-Screen, eingefroren) ──────────────
            if last_img is not None:
                diff = cv2.absdiff(img, last_img)
                if diff.mean() / 255.0 < 0.02:  # <2% Unterschied
                    stuck_count += 1
                    log.warning(f"Bild fast identisch zum vorherigen – stuck={stuck_count}")
                    if stuck_count >= 3:
                        log.warning("Feststeckend (Suggestion-Screen?) → Back")
                        d.press("back")
                        time.sleep(1)
                        break
                    d.click(0.85, 0.5)
                    time.sleep(random.uniform(0.3, 1.0))
                    continue
                else:
                    stuck_count = 0
            last_img = img

            # ── Duplikat-Erkennung via Perceptual Hash ────────────────────────
            thumb = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (16, 16))
            phash = (thumb > thumb.mean()).flatten()
            is_dup = any(
                np.count_nonzero(phash != h) < 20  # <20 von 256 Bits verschieden
                for h in seen_hashes
            )
            if is_dup:
                skipped += 1
                log.info(f"Duplikat übersprungen (gesamt {skipped})")
                d.click(0.85, 0.5)
                time.sleep(random.uniform(0.3, 1.0))
                continue
            seen_hashes.append(phash)

            # ── Speichern ─────────────────────────────────────────────────────
            save(img, f"story_{i:03d}")
            count += 1
            log.info(f"Story {count} gespeichert")

            # Nächste Story klicken
            d.click(0.85, 0.5)
            time.sleep(random.uniform(0.3, 1.5))

        except Exception as e:
            log.warning(f"Fehler bei Story {i}: {e}")
            try:
                cur = d.app_current()
                if "instagram" not in cur.get("package", "").lower():
                    log.error("Instagram gecrasht!")
                    d.app_start("com.instagram.android")
                    time.sleep(4)
                    break
            except Exception:
                log.error("Verbindung zum Phone verloren")
                break

    # Nach Story-Loop: sicherstellen dass wir nicht auf Reels gelandet sind
    d.press("back")
    time.sleep(0.5)

    log.info(f"=== Fertig: {count} gespeichert, {skipped} Duplikate übersprungen ===")


if __name__ == "__main__":
    main()
