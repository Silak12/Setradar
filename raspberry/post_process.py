"""
Post-Processing nach jeder Scraping-Session:
  1. Duplikate in captured_stories/ entfernen (pHash)
  2. local_to_db.py aufrufen für OpenAI-Analyse + Supabase-Upload

Crontab Beispiel (5 Min nach main.py Ende):
  35 * * * * cd /home/pi/Lineup-Berlin/raspberry && .venv/bin/python post_process.py >> logs/post_process.log 2>&1
"""
import sys
import logging
import logging.handlers
import subprocess
from pathlib import Path

import cv2
import numpy as np

# ── Config ────────────────────────────────────────────────────────────────────

FOLDER          = Path(__file__).parent / "captured_stories"
LOG_FILE        = Path(__file__).parent / "logs" / "post_process.log"
DEDUP_THRESHOLD = 20   # Bits (von 256) – unter diesem Wert = Duplikat

# ── Logging ───────────────────────────────────────────────────────────────────

Path(__file__).parent.joinpath("logs").mkdir(exist_ok=True)
fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
logging.basicConfig(level=logging.INFO, format=fmt,
                    handlers=[logging.StreamHandler(sys.stdout)])
fh = logging.handlers.RotatingFileHandler(LOG_FILE, maxBytes=2_000_000, backupCount=2)
fh.setFormatter(logging.Formatter(fmt))
logging.getLogger().addHandler(fh)
log = logging.getLogger("post_process")


# ── pHash ─────────────────────────────────────────────────────────────────────

def phash(path):
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    thumb = cv2.resize(img, (16, 16))
    return (thumb > thumb.mean()).flatten()


# ── Dedup ─────────────────────────────────────────────────────────────────────

def dedup(files):
    seen = []
    kept = []
    removed = 0

    for f in files:
        h = phash(f)
        if h is None:
            log.warning(f"Nicht lesbar: {f.name}")
            continue

        is_dup = any(np.count_nonzero(h != s) < DEDUP_THRESHOLD for s in seen)
        if is_dup:
            f.unlink()
            removed += 1
        else:
            seen.append(h)
            kept.append(f)

    log.info(f"Dedup: {len(kept)} behalten, {removed} gelöscht")
    return kept


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    files = sorted(FOLDER.glob("story_*.png"))
    if not files:
        log.info(f"Keine neuen Bilder in {FOLDER}")
        return

    log.info(f"=== Post-Processing: {len(files)} Bilder ===")

    unique_files = dedup(files)
    log.info(f"=== Dedup fertig: {len(unique_files)} einzigartige Bilder ===")

    if unique_files:
        log.info("Starte local_to_db.py...")
        script = Path(__file__).parent / "local_to_db.py"
        subprocess.run([sys.executable, str(script)], check=False)


if __name__ == "__main__":
    main()
