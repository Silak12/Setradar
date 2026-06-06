"""
debug_vision.py – Story-Avatare einzeln analysieren

Für jeden Avatar von links nach rechts:
  → prüfen ob Follow-Button (#181c1f) darin vorkommt = suggested account

Usage:
    python debug_vision.py                              # Live-Screenshot
    python debug_vision.py test_captures/bild.jpg      # Lokales Bild
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import uiautomator2 as u2

# ── Konstanten (Samsung A15: 1080×2340px) ─────────────────────────────────────
STORY_BAR_Y1       = 237
STORY_BAR_Y2       = 268
STORY_BAR_CENTER_Y = 305

# Follow-Zone: y-Bereich innerhalb der Avatar-Kreise wo der Follow-Button sitzt
# (per debug-session kalibriert)
FOLLOW_Y1 = 485   # nur unteres Drittel der ursprünglichen Zone (war 448)
FOLLOW_Y2 = 503

# Follow-Button Farbe: #181c1f = RGB(24,28,31) → BGR(31,28,24)
# Hintergrund:         #0f141a = RGB(15,20,26) → BGR(26,20,15)
# Enge Range: schließt Hintergrund aus (G<22, R<18), trifft nur Button
FOLLOW_BGR     = np.array([31, 28, 24])
FOLLOW_LOW     = np.array([26, 22, 18])
FOLLOW_HIGH    = np.array([40, 36, 32])
FOLLOW_MIN_PX  = 400   # Follow-Button ist ein großes Pill – braucht viele Pixel

OUTPUT_DIR = Path(__file__).parent / "debug_output"


def load_image(path: str | None):
    if path:
        img = cv2.imread(path)
        if img is None:
            print(f"[✗] Bild nicht lesbar: {path}")
            sys.exit(1)
        print(f"[→] Lokales Bild: {path}  ({img.shape[1]}×{img.shape[0]}px)")
        return img
    print("[→] Verbinde mit Phone...")
    d = u2.connect()
    img = d.screenshot(format="opencv")
    print(f"[→] Live-Screenshot: {img.shape[1]}×{img.shape[0]}px")
    return img


def s(val, img_dim, ref=2340):
    """Skaliert einen Koordinatenwert von 2340px-Referenz auf echte Bildgröße."""
    return max(0, min(img_dim, int(val * img_dim / ref)))


def find_avatar_centers(img):
    """
    Findet alle Story-Avatar X-Positionen anhand der Gradient-Ringe.
    Gibt sortierte Liste von Mittelpunkt-X-Werten zurück.
    """
    h, w   = img.shape[:2]
    bar    = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
    hsv    = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

    rot_a  = cv2.inRange(hsv, np.array([0,   120, 120]), np.array([10,  255, 255]))
    rot_b  = cv2.inRange(hsv, np.array([160, 120, 120]), np.array([180, 255, 255]))
    orange = cv2.inRange(hsv, np.array([10,  120, 120]), np.array([35,  255, 255]))
    lila   = cv2.inRange(hsv, np.array([130,  60, 120]), np.array([160, 255, 255]))

    mask = cv2.bitwise_or(
        cv2.bitwise_or(rot_a, rot_b),
        cv2.bitwise_or(orange, lila)
    )

    # Konturen finden
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    # X-Mittelpunkte aller Konturen sammeln
    xs = []
    for c in contours:
        M = cv2.moments(c)
        if M["m00"] > 0:
            xs.append(int(M["m10"] / M["m00"]))

    # Nahe Punkte (< 30px) zum selben Avatar zusammenfassen
    xs.sort()
    merged = []
    for x in xs:
        if merged and abs(x - merged[-1]) < 30:
            merged[-1] = (merged[-1] + x) // 2  # Durchschnitt
        else:
            merged.append(x)

    return merged


def check_avatar_follow(img, cx, h):
    """
    Prüft ob ein Avatar an Position cx den Follow-Button enthält.
    Scannt die Follow-Zone (FOLLOW_Y1–FOLLOW_Y2) ±55px um cx.
    Gibt (has_follow, pixel_count, sample_bgr) zurück.
    """
    avatar_half = 55  # halbe Avatar-Breite in px

    fy1 = s(FOLLOW_Y1, h)
    fy2 = s(FOLLOW_Y2, h)
    fx1 = max(0, cx - avatar_half)
    fx2 = min(img.shape[1], cx + avatar_half)

    region = img[fy1:fy2, fx1:fx2]
    if region.size == 0:
        return False, 0, None

    mask   = cv2.inRange(region, FOLLOW_LOW, FOLLOW_HIGH)
    pixels = cv2.countNonZero(mask)

    # Durchschnitts-BGR der gesamten Zone
    sample_bgr = tuple(int(v) for v in region.mean(axis=(0, 1)))

    # Durchschnitts-BGR nur der matching Pixel (zeigt was wirklich erkannt wird)
    match_coords = np.where(mask > 0)
    if len(match_coords[0]) > 0:
        match_pixels = region[match_coords]
        match_avg = tuple(int(v) for v in match_pixels.mean(axis=0))
    else:
        match_avg = None

    return pixels >= FOLLOW_MIN_PX, pixels, sample_bgr, match_avg


def main():
    img_path = sys.argv[1] if len(sys.argv) > 1 else None
    img      = load_image(img_path)
    out      = img.copy()
    h, w     = img.shape[:2]

    # ── Story-Bar Gesamtcheck ─────────────────────────────────────────────────
    bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
    hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)
    rot_a  = cv2.inRange(hsv, np.array([0,   120, 120]), np.array([10,  255, 255]))
    rot_b  = cv2.inRange(hsv, np.array([160, 120, 120]), np.array([180, 255, 255]))
    orange = cv2.inRange(hsv, np.array([10,  120, 120]), np.array([35,  255, 255]))
    lila   = cv2.inRange(hsv, np.array([130,  60, 120]), np.array([160, 255, 255]))
    counts = {
        "rot":    cv2.countNonZero(cv2.bitwise_or(rot_a, rot_b)),
        "orange": cv2.countNonZero(orange),
        "lila":   cv2.countNonZero(lila),
    }
    zones_active  = sum(1 for v in counts.values() if v > 80)
    one_dominates = any(v > (STORY_BAR_Y2 - STORY_BAR_Y1) * w * 0.9 for v in counts.values())
    has_stories   = zones_active >= 2 and not one_dominates

    cv2.rectangle(out, (0, s(STORY_BAR_Y1, h)), (w, s(STORY_BAR_Y2, h)), (0, 255, 0), 2)
    cv2.rectangle(out, (0, s(FOLLOW_Y1, h)),    (w, s(FOLLOW_Y2, h)),    (0, 165, 255), 1)
    cv2.putText(out, "Story-Bar", (4, s(STORY_BAR_Y1, h) - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    cv2.putText(out, f"Follow-Zone  (#181c1f ±12)", (4, s(FOLLOW_Y2, h) + 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1)

    print(f"\n── Story-Bar ───────────────────────────────")
    print(f"  Pixel: rot={counts['rot']}  orange={counts['orange']}  lila={counts['lila']}")
    print(f"  has_unseen_stories: {'JA ✓' if has_stories else 'NEIN ✗'}")

    # ── Avatar-Analyse ────────────────────────────────────────────────────────
    centers = find_avatar_centers(img)
    print(f"\n── Avatare gefunden: {len(centers)} ────────────────────")

    followed  = 0
    suggested = 0

    for i, cx in enumerate(centers):
        has_follow, px, bgr, match_avg = check_avatar_follow(img, cx, h)

        cy = s(STORY_BAR_CENTER_Y, h)
        fy1_px = s(FOLLOW_Y1, h)
        fy2_px = s(FOLLOW_Y2, h)
        fx1 = max(0, cx - 55)
        fx2 = min(w, cx + 55)

        if has_follow:
            suggested += 1
            ring_color  = (0, 80, 255)   # rot → suggested
            label       = f"#{i+1} SUGGESTED (px={px})"
        else:
            followed += 1
            ring_color  = (0, 255, 80)   # grün → followed
            label       = f"#{i+1} followed (px={px})"

        # Avatar-Kreis einzeichnen
        cv2.circle(out, (cx, cy), 58, ring_color, 2)
        # Follow-Zone pro Avatar einzeichnen
        cv2.rectangle(out, (fx1, fy1_px), (fx2, fy2_px), ring_color, 1)
        # Label
        cv2.putText(out, label, (fx1, fy1_px - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, ring_color, 1)

        status    = "SUGGESTED" if has_follow else "followed"
        bgr_str   = f"BGR{bgr}"       if bgr       else "–"
        match_str = f"BGR{match_avg}" if match_avg else "–"
        print(f"  [{i+1}] cx={cx:4d}  {status:10s}  follow-px={px:4d}  "
              f"zone-avg={bgr_str}  match-avg={match_str}")

    print(f"\n── Ergebnis ────────────────────────────────")
    print(f"  Gesamt Avatare:  {len(centers)}")
    print(f"  Followed:        {followed}")
    print(f"  Suggested:       {suggested}")
    all_suggested = len(centers) > 0 and suggested == len(centers)
    print(f"  → Nur noch suggested? {'JA → scrapen beenden' if all_suggested else 'NEIN → weiter'}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    src_name   = Path(img_path).stem if img_path else "live"
    debug_path = OUTPUT_DIR / f"debug_{src_name}.jpg"
    cv2.imwrite(str(debug_path), out)
    print(f"\n[✓] Debug-Bild: {debug_path}")


if __name__ == "__main__":
    main()
