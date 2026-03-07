"""
Schneller Drive-Upload-Test.
Lädt alle story_*.png aus captured_stories/ direkt in DRIVE_FOLDER_ID hoch.
Kein Dedup, kein Löschen, kein Unterordner.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

FOLDER = Path(__file__).parent / "captured_stories"
SCOPES = ["https://www.googleapis.com/auth/drive"]

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
folder_id = os.getenv("DRIVE_FOLDER_ID", "")
if not folder_id:
    print("FEHLER: DRIVE_FOLDER_ID fehlt in .env")
    sys.exit(1)

sa_path = Path(__file__).parent.parent / "service_account.json"
creds = service_account.Credentials.from_service_account_file(str(sa_path), scopes=SCOPES)
service = build("drive", "v3", credentials=creds)
print("Drive verbunden")

files = sorted(FOLDER.glob("story_*.png"))
if not files:
    print(f"Keine Bilder in {FOLDER}")
    sys.exit(0)

# Nur die ersten 3 hochladen um schnell zu testen
test_files = files[:3]
print(f"Lade {len(test_files)} von {len(files)} Bildern hoch...")

for f in test_files:
    try:
        meta  = {"name": f.name, "parents": [folder_id]}
        media = MediaFileUpload(str(f), mimetype="image/png")
        result = service.files().create(
            body=meta, media_body=media, fields="id",
            supportsAllDrives=True
        ).execute()
        print(f"  OK: {f.name} → id={result['id']}")
    except Exception as e:
        print(f"  FEHLER: {f.name}: {e}")

print("Fertig.")
