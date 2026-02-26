"""
setradar - Module 2: Drive Fetcher + OpenAI Vision Analyzer
------------------------------------------------------------
1. Holt neue Bilder aus einem Google Drive Ordner
2. Schickt sie an OpenAI Vision API
3. Gibt strukturiertes JSON zurück (Event, DJs, Uhrzeiten)
4. Merkt sich welche Bilder bereits verarbeitet wurden

Setup:
    pip install google-api-python-client google-auth openai

Umgebungsvariablen (.env):
    GOOGLE_SERVICE_ACCOUNT_JSON = /pfad/zu/service_account.json
    OPENAI_API_KEY               = sk-...
    DRIVE_FOLDER_ID              = ID des Drive-Ordners

Usage:
    python module_2_drive_to_openai.py
    python module_2_drive_to_openai.py --watch   # alle 5 Min automatisch
"""

import os
import json
import time
import argparse
import tempfile
from datetime import datetime
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

from openai import OpenAI
import base64

from pathlib import Path
from dotenv import load_dotenv

# .env immer vom Root laden, egal von wo das Script aufgerufen wird
load_dotenv(Path(__file__).parent.parent.parent / ".env")


# ── Config ────────────────────────────────────────────────────────────────────

SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "service_account.json")
OPENAI_API_KEY       = os.getenv("OPENAI_API_KEY", "")
DRIVE_FOLDER_ID      = os.getenv("DRIVE_FOLDER_ID", "")  # ID aus der Drive-URL

PROCESSED_LOG        = "processed_files.json"   # merkt sich verarbeitete Bilder
OUTPUT_FILE          = "timetable_results.json"  # gesammelte Ergebnisse
POLL_INTERVAL        = 300  # Sekunden zwischen Checks im --watch Modus (5 Min)

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


# ── OpenAI Prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Du bist ein Assistent der Timetable-Informationen aus Club- und DJ-Instagram-Stories extrahiert.
Analysiere das Bild und extrahiere strukturierte Daten.
Antworte NUR mit validem JSON, kein Text davor oder danach."""

USER_PROMPT = """Analysiere dieses Bild und extrahiere alle Timetable-Informationen.

Gib die Antwort in diesem exakten JSON-Format zurück:

{
  "is_timetable": true,
  "confidence": "high|medium|low",
  "event_name": "Name des Events oder null",
  "venue": "Name des Clubs/Venue oder null",
  "date": "YYYY-MM-DD oder null",
  "artists": [
    {
      "name": "DJ Name",
      "start_time": "HH:MM oder null",
      "end_time": "HH:MM oder null",
      "stage": "Stage/Floor Name oder null"
    }
  ],
  "notes": "Sonstige relevante Infos oder null"
}

Wenn kein Timetable erkennbar ist, gib zurück:
{
  "is_timetable": false,
  "confidence": "high",
  "notes": "Kurze Beschreibung was stattdessen zu sehen ist"
}"""


# ── Google Drive ──────────────────────────────────────────────────────────────

def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds)


def list_images_in_folder(service, folder_id: str) -> list[dict]:
    """Gibt alle Bild-Dateien im Ordner zurück."""
    query = (
        f"'{folder_id}' in parents "
        f"and mimeType contains 'image/' "
        f"and trashed = false"
    )
    result = service.files().list(
        q=query,
        fields="files(id, name, createdTime, mimeType)",
        orderBy="createdTime desc"
    ).execute()
    return result.get("files", [])


def download_image(service, file_id: str) -> bytes:
    """Lädt eine Datei aus Drive herunter und gibt Bytes zurück."""
    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buffer.getvalue()


# ── Processed Log ─────────────────────────────────────────────────────────────

def load_processed() -> set:
    if Path(PROCESSED_LOG).exists():
        with open(PROCESSED_LOG) as f:
            return set(json.load(f))
    return set()


def save_processed(processed: set):
    with open(PROCESSED_LOG, "w") as f:
        json.dump(list(processed), f)


# ── OpenAI Vision ─────────────────────────────────────────────────────────────

def analyze_image(client: OpenAI, image_bytes: bytes, filename: str) -> dict:
    """Schickt ein Bild an GPT-4o Vision und gibt strukturiertes JSON zurück."""
    
    # Bild zu base64 konvertieren
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    
    # MIME type aus Dateiname ableiten
    ext = Path(filename).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", 
                ".png": "image/png", ".webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/jpeg")

    print(f"  [→] Sende an OpenAI Vision: {filename}")

    response = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_b64}",
                            "detail": "high"
                        }
                    },
                    {"type": "text", "text": USER_PROMPT}
                ]
            }
        ],
        max_tokens=1000,
        temperature=0,  # deterministisch für strukturierte Daten
    )

    raw_text = response.choices[0].message.content.strip()
    
    # JSON aus Antwort parsen (manchmal kommt ```json ... ``` drum herum)
    if "```" in raw_text:
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        print(f"  [!] JSON Parse Fehler, raw response: {raw_text[:200]}")
        return {"is_timetable": False, "error": "parse_error", "raw": raw_text}


# ── Results speichern ─────────────────────────────────────────────────────────

def load_results() -> list:
    if Path(OUTPUT_FILE).exists():
        with open(OUTPUT_FILE) as f:
            return json.load(f)
    return []


def save_result(result: dict):
    results = load_results()
    results.append(result)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


# ── Hauptlogik ────────────────────────────────────────────────────────────────

def process_new_images(verbose: bool = True):
    """
    Prüft auf neue Bilder im Drive-Ordner und verarbeitet sie.
    Gibt die Anzahl neu verarbeiteter Bilder zurück.
    """
    if not DRIVE_FOLDER_ID:
        print("[✗] DRIVE_FOLDER_ID nicht gesetzt!")
        return 0
    if not OPENAI_API_KEY:
        print("[✗] OPENAI_API_KEY nicht gesetzt!")
        return 0

    drive_service = get_drive_service()
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    processed = load_processed()

    # Alle Bilder im Ordner holen
    images = list_images_in_folder(drive_service, DRIVE_FOLDER_ID)
    new_images = [img for img in images if img["id"] not in processed]

    if not new_images:
        if verbose:
            print(f"[✓] Keine neuen Bilder. ({len(images)} gesamt im Ordner)")
        return 0

    print(f"[→] {len(new_images)} neue Bild(er) gefunden, verarbeite...")

    for img in new_images:
        print(f"\n── {img['name']} ({img['id'][:8]}...) ──")
        
        try:
            # Download
            image_bytes = download_image(drive_service, img["id"])
            
            # OpenAI Analyse
            analysis = analyze_image(openai_client, image_bytes, img["name"])
            
            # Ergebnis zusammenbauen
            result = {
                "file_id": img["id"],
                "file_name": img["name"],
                "drive_created_at": img.get("createdTime"),
                "processed_at": datetime.now().isoformat(),
                "analysis": analysis
            }
            
            # Ausgabe
            if analysis.get("is_timetable"):
                artists = analysis.get("artists", [])
                print(f"  [✓] Timetable erkannt! {len(artists)} Artist(s)")
                for a in artists:
                    time_str = f"{a.get('start_time', '?')} - {a.get('end_time', '?')}"
                    print(f"      • {a.get('name')} @ {time_str}")
            else:
                print(f"  [–] Kein Timetable: {analysis.get('notes', '')}")
            
            # Speichern
            save_result(result)
            processed.add(img["id"])
            save_processed(processed)

        except Exception as e:
            print(f"  [✗] Fehler bei {img['name']}: {e}")
            # Trotzdem als processed markieren damit wir nicht endlos retrien
            processed.add(img["id"])
            save_processed(processed)

    return len(new_images)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Drive → OpenAI Timetable Extractor")
    parser.add_argument("--watch", action="store_true", 
                        help=f"Automatisch alle {POLL_INTERVAL//60} Min auf neue Bilder prüfen")
    parser.add_argument("--interval", type=int, default=POLL_INTERVAL,
                        help="Poll-Intervall in Sekunden (default: 300)")
    args = parser.parse_args()

    if args.watch:
        print(f"[★] Watch-Modus: prüfe alle {args.interval//60} Minuten auf neue Bilder...")
        print(f"    Stoppen mit Ctrl+C\n")
        while True:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Checking...")
            process_new_images(verbose=True)
            time.sleep(args.interval)
    else:
        process_new_images(verbose=True)
        print(f"\n[✓] Ergebnisse gespeichert in: {OUTPUT_FILE}")