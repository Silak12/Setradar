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

# Story-Leiste Y-Bereich (anpassen falls nötig)
STORY_BAR_Y1 = 155
STORY_BAR_Y2 = 390

MAX_STORIES = 50


# ── Helpers ───────────────────────────────────────────────────────────────────

def ts():
    return datetime.now().strftime("%H%M%S_%f")


def save(img, name):
    path = str(OUTPUT_DIR / f"{name}_{ts()}.png")
    cv2.imwrite(path, img)
    log.info(f"  Gespeichert: {path}")
    return path


def analyze_story_bar(img):
    """Gibt detaillierte Debug-Infos zur Story-Leiste aus."""
    h, w = img.shape[:2]
    log.info(f"Bild: {w}x{h}px")

    bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
    hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

    avg_hsv = hsv.mean(axis=(0, 1))
    log.info(f"Story-Bar HSV Durchschnitt: H={avg_hsv[0]:.1f} S={avg_hsv[1]:.1f} V={avg_hsv[2]:.1f}")

    # Instagram Gradient: Rot (0-10 + 160-179), Orange/Gelb (10-35), Pink/Lila (130-160)
    masks = {
        "Rot-A    (H  0-10)":  cv2.inRange(hsv, np.array([0,   100, 100]), np.array([10,  255, 255])),
        "Rot-B    (H160-179)": cv2.inRange(hsv, np.array([160, 100, 100]), np.array([179, 255, 255])),
        "Orange   (H 10-35)":  cv2.inRange(hsv, np.array([10,  100, 100]), np.array([35,  255, 255])),
        "Pink/Lila(H130-160)": cv2.inRange(hsv, np.array([130,  50, 100]), np.array([160, 255, 255])),
    }

    total = 0
    for name, mask in masks.items():
        count = cv2.countNonZero(mask)
        log.info(f"  {name}: {count} Pixel")
        total += count

    log.info(f"  ─── Gesamt Gradient-Pixel: {total} (Schwellwert: 300)")
    return total > 300, bar, masks


def find_first_avatar(img):
    h, w = img.shape[:2]
    bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
    hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

    mask = (
        cv2.inRange(hsv, np.array([0,   100, 100]), np.array([10,  255, 255])) |
        cv2.inRange(hsv, np.array([160, 100, 100]), np.array([179, 255, 255])) |
        cv2.inRange(hsv, np.array([10,  100, 100]), np.array([35,  255, 255])) |
        cv2.inRange(hsv, np.array([130,  50, 100]), np.array([160, 255, 255]))
    )

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    leftmost = min(contours, key=lambda c: cv2.boundingRect(c)[0])
    M = cv2.moments(leftmost)
    if M["m00"] == 0:
        return None

    cx = int(M["m10"] / M["m00"])
    cy = int(M["m01"] / M["m00"]) + STORY_BAR_Y1

    rel_x = cx / w
    rel_y = cy / h
    log.info(f"Erster Avatar bei Pixel ({cx}, {cy}) → relativ ({rel_x:.2f}, {rel_y:.2f})")
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

    # Instagram öffnen
    log.info("Öffne Instagram...")
    d.app_start("com.instagram.android")
    time.sleep(4)

    # Sicherstellen dass Instagram nicht gecrasht ist
    cur_app = d.app_current()
    log.info(f"Aktive App: {cur_app}")
    if "instagram" not in cur_app.get("package", "").lower():
        log.error("Instagram läuft nicht! Versuche neu zu starten...")
        d.app_stop("com.instagram.android")
        time.sleep(2)
        d.app_start("com.instagram.android")
        time.sleep(5)

    # Home-Tab
    try:
        d(description="Home").click()
        log.info("Home-Tab geklickt")
    except Exception:
        log.warning("Home-Tab nicht gefunden (evtl. schon aktiv)")
    time.sleep(3)

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
    log.info("Starte Story-Capture...")

    for i in range(MAX_STORIES):
        open_now, _ = is_story_open(d)
        if not open_now:
            log.info(f"Keine Story mehr offen nach {count} Screenshots.")
            break

        try:
            # 1. Screenshot machen
            img = d.screenshot(format="opencv")
            save(img, f"story_{i:03d}")
            count += 1
            log.info(f"Story {count} gespeichert")

            # 2. Sofort nächste Story klicken (nicht warten)
            d.click(0.85, 0.5)

            # 3. Kurz random warten während Story lädt
            time.sleep(random.uniform(0.3, 1.5))

        except Exception as e:
            log.warning(f"Fehler bei Story {i}: {e}")
            # Prüfen ob Instagram noch läuft
            try:
                cur = d.app_current()
                if "instagram" not in cur.get("package", "").lower():
                    log.error("Instagram gecrasht! Neustart...")
                    d.app_start("com.instagram.android")
                    time.sleep(4)
                    break
            except Exception:
                log.error("Verbindung zum Phone verloren")
                break

    log.info(f"=== Fertig: {count} Stories gespeichert in {OUTPUT_DIR} ===")


if __name__ == "__main__":
    main()
