"""
test_ocr.py – EasyOCR Pre-Filter Test

Liest alle Bilder aus test_captures/, läuft EasyOCR drüber,
gibt aus was erkannt wurde und ob der Pre-Filter durchlässt oder blockiert.
Bilder werden NICHT gelöscht.

Usage:
    python test_ocr.py
    python test_ocr.py test_captures/einzelbild.jpg
"""
import sys
import re
from pathlib import Path

import numpy as np
import easyocr
from PIL import Image

# ── Config ────────────────────────────────────────────────────────────────────
TEST_DIR    = Path(__file__).parent / "test_captures"
LANGUAGES   = ["en", "de"]

# Statusbar oben abschneiden (Uhrzeit + Batterie, Samsung A15 ~80px bei 2340px)
CROP_TOP_PX = 80

# Regex: Uhrzeiten wie 21:00, 03:30, 3:00
TIME_PATTERN = re.compile(r"\b\d{1,2}:\d{2}\b")

# Video-Timer Zone oben rechts ausschließen (Samsung A15: 1080×2340px)
# x > 900, y < 400 → dort steht immer der Reels/Video-Countdown
EXCLUDE_ZONES = [
    {"x1": 900, "y1": 0, "x2": 1080, "y2": 400},
]

# Keywords die auf Cancellation hinweisen
CANCEL_KEYWORDS = [
    "cancel", "cancelled", "canceled", "sick", "ill", "leider",
    "absagt", "abgesagt", "fällt aus", "not perform", "unfortunate"
]

# ── EasyOCR Reader (einmal initialisieren) ────────────────────────────────────
print("[→] Lade EasyOCR Modell...")
reader = easyocr.Reader(LANGUAGES, gpu=False, verbose=False)
print("[✓] Modell geladen\n")


def check_image(img_path: Path, debug: bool = False) -> dict:
    # Statusbar abschneiden damit Uhrzeit/Batterie nicht als Zeiten erkannt werden
    img = Image.open(img_path)
    w, h = img.size
    crop_px = int(CROP_TOP_PX * h / 2340)  # skaliert für unterschiedliche Auflösungen
    img_cropped = img.crop((0, crop_px, w, h))

    results = reader.readtext(np.array(img_cropped), detail=1, paragraph=False)

    if debug:
        import cv2
        dbg = cv2.imread(str(img_path))
        print(f"  {'Text':<30} {'Conf':>5}  {'x1':>5} {'y1':>5} {'x2':>5} {'y2':>5}  (original px)")
        print(f"  {'─'*30} {'─'*5}  {'─'*5} {'─'*5} {'─'*5} {'─'*5}")
        for (bbox, text, conf) in results:
            pts = np.array(bbox, dtype=np.int32)
            pts[:, 1] += crop_px  # zurück auf originale Koordinaten
            x1, y1 = pts[0]
            x2, y2 = pts[2]
            print(f"  {text:<30} {conf:>5.2f}  {x1:>5} {y1:>5} {x2:>5} {y2:>5}")
            cv2.polylines(dbg, [pts], True, (0, 255, 0), 1)
            cv2.putText(dbg, f"{text}", (x1, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
        out_path = Path(__file__).parent / "debug_output" / f"ocr_{img_path.stem}.jpg"
        out_path.parent.mkdir(exist_ok=True)
        cv2.imwrite(str(out_path), dbg)
        print(f"\n  [debug] Annotiertes Bild: {out_path}")

    texts    = [r[1] for r in results]
    full_text = " ".join(texts).lower()

    # Zeiten nur aus Boxen außerhalb der Exclude-Zonen nehmen
    time_texts = []
    for (bbox, text, conf) in results:
        pts = np.array(bbox, dtype=np.int32)
        pts[:, 1] += crop_px
        x1, y1 = int(pts[0][0]), int(pts[0][1])
        x2, y2 = int(pts[2][0]), int(pts[2][1])
        excluded = any(
            x1 >= z["x1"] and y1 >= z["y1"] and x2 <= z["x2"] and y2 <= z["y2"]
            for z in EXCLUDE_ZONES
        )
        if not excluded:
            time_texts.append(text)

    times    = TIME_PATTERN.findall(" ".join(time_texts))
    cancels  = [kw for kw in CANCEL_KEYWORDS if kw in full_text]

    has_time   = len(times) > 0
    has_cancel = len(cancels) > 0
    send_to_ai = has_time or has_cancel

    return {
        "texts":      texts,
        "times":      times,
        "cancels":    cancels,
        "send_to_ai": send_to_ai,
    }


def main():
    args  = [a for a in sys.argv[1:] if not a.startswith("--")]
    debug = "--debug" in sys.argv

    if args:
        p = Path(args[0])
        # Pfad relativ zu test_captures falls Datei nicht direkt gefunden wird
        if not p.exists():
            p = TEST_DIR / p.name
        images = [p]
    else:
        images = sorted(TEST_DIR.glob("*.jpg")) + sorted(TEST_DIR.glob("*.png"))

    if not images:
        print(f"[!] Keine Bilder in {TEST_DIR}")
        return

    send_count = 0
    skip_count = 0

    for img_path in images:
        print(f"── {img_path.name} {'─' * max(0, 50 - len(img_path.name))}")
        result = check_image(img_path, debug=debug)

        print(f"  Erkannter Text:")
        for t in result["texts"]:
            print(f"    · {t}")

        print(f"  Zeiten gefunden:  {result['times'] if result['times'] else '–'}")
        print(f"  Cancel-Keywords:  {result['cancels'] if result['cancels'] else '–'}")

        if result["send_to_ai"]:
            send_count += 1
            print(f"  → WEITERLEITEN an OpenAI ✓")
        else:
            skip_count += 1
            print(f"  → ÜBERSPRINGEN (kein Timetable-Inhalt)")
        print()

    print(f"── Zusammenfassung ──────────────────────────────────")
    print(f"  Bilder gesamt:       {len(images)}")
    print(f"  → an OpenAI:         {send_count}")
    print(f"  → übersprungen:      {skip_count}")
    if len(images) > 0:
        saving = skip_count / len(images) * 100
        print(f"  → API-Calls gespart: {saving:.0f}%")


if __name__ == "__main__":
    main()
