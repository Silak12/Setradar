"""
Post-Processing nach jeder Scraping-Session:
  1. Duplikate in captured_stories/ entfernen (pHash)
  2. Verbleibende neue Bilder auf Google Drive hochladen
  3. Lokale Kopien nach erfolgreichem Upload löschen

Crontab Beispiel (5 Min nach main.py Ende, also bei Minute 35):
  35 * * * * cd /home/pi/Lineup-Berlin/raspberry && .venv/bin/python post_process.py >> logs/post_process.log 2>&1
"""
import os
import sys
import logging
import logging.handlers
from pathlib import Path
from dotenv import load_dotenv

import cv2
import numpy as np
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

# ── Config ────────────────────────────────────────────────────────────────────

FOLDER         = Path("./captured_stories")
LOG_FILE       = Path("./logs/post_process.log")
SCOPES         = ["https://www.googleapis.com/auth/drive"]
DEDUP_THRESHOLD = 20   # Bits (von 256) – unter diesem Wert = Duplikat
DELETE_AFTER_UPLOAD = True  # Lokale Dateien nach Upload löschen?

# ── Logging ───────────────────────────────────────────────────────────────────

Path("logs").mkdir(exist_ok=True)
fmt = "%(asctime)s [%(levelname)s] %(message)s"
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
    """Gibt Liste der einzigartigen Dateien zurück, löscht Duplikate."""
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


# ── Drive Upload ──────────────────────────────────────────────────────────────

def init_drive():
    sa_path = Path(__file__).parent.parent / "service_account.json"
    creds = service_account.Credentials.from_service_account_file(
        str(sa_path), scopes=SCOPES)
    service = build("drive", "v3", credentials=creds)
    log.info("Google Drive verbunden")
    return service


def get_or_create_folder(service, name, parent_id):
    q = (f"name='{name}' and '{parent_id}' in parents and "
         f"mimeType='application/vnd.google-apps.folder' and trashed=false")
    res = service.files().list(q=q, fields="files(id)").execute()
    if res["files"]:
        return res["files"][0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]}
    f = service.files().create(body=meta, fields="id").execute()
    log.info(f"Drive-Ordner erstellt: {name}")
    return f["id"]


def upload_files(files, folder_id):
    if not files:
        log.info("Nichts hochzuladen")
        return 0

    service = init_drive()
    stories_folder = get_or_create_folder(service, "stories", folder_id)

    uploaded = 0
    failed = 0

    for f in files:
        try:
            meta  = {"name": f.name, "parents": [stories_folder]}
            media = MediaFileUpload(str(f), mimetype="image/png")
            service.files().create(body=meta, media_body=media, fields="id").execute()
            log.info(f"  Upload OK: {f.name}")
            uploaded += 1

            if DELETE_AFTER_UPLOAD:
                f.unlink()

        except Exception as e:
            log.error(f"  Upload fehlgeschlagen {f.name}: {e}")
            failed += 1

    log.info(f"Upload: {uploaded} erfolgreich, {failed} fehlgeschlagen")
    return uploaded


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
    folder_id = os.getenv("DRIVE_FOLDER_ID", "")
    if not folder_id:
        log.error("DRIVE_FOLDER_ID fehlt in .env – Abbruch")
        sys.exit(1)

    files = sorted(FOLDER.glob("story_*.png"))
    if not files:
        log.info(f"Keine neuen Bilder in {FOLDER}")
        return

    log.info(f"=== Post-Processing: {len(files)} Bilder ===")

    # 1. Dedup
    unique_files = dedup(files)

    # 2. Upload
    uploaded = upload_files(unique_files, folder_id)

    log.info(f"=== Fertig: {uploaded} Bilder auf Drive ===")


if __name__ == "__main__":
    main()
