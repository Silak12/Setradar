"""
setradar - drive_to_db.py
--------------------------
1. Holt neue Bilder aus Google Drive
2. Extrahiert per OpenAI Vision: Instagram-Handle + Set-Zeiten
3. Matched Handle gegen acts.insta_name in Supabase
4. Schreibt start_time / end_time ins nächste Event des Acts

Umgebungsvariablen (.env):
    GOOGLE_SERVICE_ACCOUNT_JSON  = service_account.json
    OPENAI_API_KEY               = sk-...
    DRIVE_FOLDER_ID              = ID des Drive-Ordners
    SUPABASE_URL                 = https://xxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    = eyJ...

Usage:
    python drive_to_db.py
    python drive_to_db.py --watch
"""

import os
import io
import json
import time
import base64
import argparse
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from openai import OpenAI
from supabase import create_client, Client

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# ── Config ────────────────────────────────────────────────────────────────────

SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "service_account.json")
OPENAI_API_KEY       = os.getenv("OPENAI_API_KEY", "")
DRIVE_FOLDER_ID      = os.getenv("DRIVE_FOLDER_ID", "")
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY         = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

PROCESSED_LOG = Path(__file__).parent / "processed_files.json"
OUTPUT_FILE   = Path(__file__).parent / "timetable_results.json"
POLL_INTERVAL = 300
SCOPES        = ["https://www.googleapis.com/auth/drive.readonly"]

# ── Prompt ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = "Extract data from Instagram story images. Reply only with valid JSON."

USER_PROMPT = """\
From this Instagram story image return exactly:
{"handle":"<username top-left, no @, or null>","start":"<set start HH:MM or null>","end":"<set end HH:MM or null>"}
Only extract times if they clearly refer to a DJ set or performance time. Return null for unrelated content."""

# ── Google Drive ──────────────────────────────────────────────────────────────

def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds)


def list_images_in_folder(service, folder_id: str) -> list[dict]:
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
    request = service.files().get_media(fileId=file_id)
    buffer  = io.BytesIO()
    dl      = MediaIoBaseDownload(buffer, request)
    done    = False
    while not done:
        _, done = dl.next_chunk()
    return buffer.getvalue()

# ── Processed Log ─────────────────────────────────────────────────────────────

def load_processed() -> set:
    if PROCESSED_LOG.exists():
        try:
            content = PROCESSED_LOG.read_text().strip()
            return set(json.loads(content)) if content else set()
        except json.JSONDecodeError:
            return set()
    return set()


def save_processed(processed: set):
    PROCESSED_LOG.write_text(json.dumps(list(processed)))

# ── OpenAI Vision ─────────────────────────────────────────────────────────────

def analyze_image(client: OpenAI, image_bytes: bytes, filename: str) -> dict:
    """
    Gibt zurück: {"handle": str|None, "start": str|None, "end": str|None}
    """
    ext      = Path(filename).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png",  ".webp": "image/webp"}
    mime     = mime_map.get(ext, "image/jpeg")
    b64      = base64.b64encode(image_bytes).decode("utf-8")

    response = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url",
                     "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "low"}},
                    {"type": "text", "text": USER_PROMPT},
                ]
            }
        ],
        max_tokens=60,
        temperature=0,
    )

    raw = response.choices[0].message.content.strip()

    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        data = json.loads(raw)
        return {
            "handle": data.get("handle") or None,
            "start":  data.get("start")  or None,
            "end":    data.get("end")    or None,
        }
    except json.JSONDecodeError:
        print(f"  [!] JSON Parse Fehler: {raw[:120]}")
        return {"handle": None, "start": None, "end": None}

# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def find_act_by_insta(sb: Client, handle: str) -> dict | None:
    """Sucht act anhand von insta_name (case-insensitive)."""
    res = (
        sb.table("acts")
        .select("id, name, insta_name")
        .ilike("insta_name", handle)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def find_next_event_act(sb: Client, act_id: int) -> dict | None:
    """Findet den event_acts Eintrag für das nächste zukünftige Event des Acts."""
    today = date.today().isoformat()

    res = (
        sb.table("event_acts")
        .select("id, event_id, start_time, end_time")
        .eq("act_id", act_id)
        .execute()
    )
    if not res.data:
        return None

    event_ids = [row["event_id"] for row in res.data]

    events_res = (
        sb.table("events")
        .select("id, event_date, event_name")
        .in_("id", event_ids)
        .gte("event_date", today)
        .order("event_date", desc=False)
        .limit(1)
        .execute()
    )
    if not events_res.data:
        return None

    next_event = events_res.data[0]

    for row in res.data:
        if row["event_id"] == next_event["id"]:
            row["event_date"] = next_event["event_date"]
            row["event_name"] = next_event["event_name"]
            return row

    return None


def update_set_times(sb: Client, event_act_id: int,
                     start_time: str | None, end_time: str | None) -> bool:
    payload: dict = {}
    if start_time:
        payload["start_time"] = start_time
    if end_time:
        payload["end_time"] = end_time
    if not payload:
        return False
    sb.table("event_acts").update(payload).eq("id", event_act_id).execute()
    return True

# ── Results speichern ─────────────────────────────────────────────────────────

def save_result(result: dict):
    results: list = []
    if OUTPUT_FILE.exists():
        try:
            results = json.loads(OUTPUT_FILE.read_text())
        except json.JSONDecodeError:
            results = []
    results.append(result)
    OUTPUT_FILE.write_text(json.dumps(results, ensure_ascii=False, indent=2))

# ── Hauptlogik ────────────────────────────────────────────────────────────────

def process_new_images(verbose: bool = True) -> int:
    if not DRIVE_FOLDER_ID:
        print("[✗] DRIVE_FOLDER_ID nicht gesetzt!")
        return 0
    if not OPENAI_API_KEY:
        print("[✗] OPENAI_API_KEY nicht gesetzt!")
        return 0
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[✗] SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY nicht gesetzt!")
        return 0

    drive_service = get_drive_service()
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    sb            = get_supabase()
    processed     = load_processed()

    images     = list_images_in_folder(drive_service, DRIVE_FOLDER_ID)
    new_images = [img for img in images if img["id"] not in processed]

    if not new_images:
        if verbose:
            print(f"[✓] Keine neuen Bilder. ({len(images)} im Ordner)")
        return 0

    print(f"[→] {len(new_images)} neue Bild(er) gefunden...")

    for img in new_images:
        print(f"\n── {img['name']} ──")
        try:
            image_bytes = download_image(drive_service, img["id"])
            extracted   = analyze_image(openai_client, image_bytes, img["name"])

            handle = extracted["handle"]
            start  = extracted["start"]
            end    = extracted["end"]

            # Keine Zeiten erkannt → irrelevante Story, still skippen
            if not start and not end:
                processed.add(img["id"])
                save_processed(processed)
                continue

            print(f"  handle={handle}  start={start}  end={end}")

            db_result = {"matched": False, "reason": "no handle"}

            if handle:
                act = find_act_by_insta(sb, handle)
                if not act:
                    print(f"  [–] Kein Act mit insta_name='{handle}'")
                    db_result = {"matched": False, "reason": f"unknown handle: {handle}"}
                else:
                    print(f"  [✓] Act: {act['name']} (id={act['id']})")
                    event_act = find_next_event_act(sb, act["id"])
                    if not event_act:
                        print(f"  [–] Kein zukünftiges Event für {act['name']}")
                        db_result = {"matched": True, "act": act["name"], "reason": "no upcoming event"}
                    else:
                        print(f"  [✓] Event: {event_act['event_name']} am {event_act['event_date']}")
                        updated = update_set_times(sb, event_act["id"], start, end)
                        print(f"  [✓] DB: start={start} end={end} → {'gespeichert' if updated else 'keine Zeiten'}")
                        db_result = {
                            "matched":    True,
                            "act":        act["name"],
                            "event":      event_act["event_name"],
                            "event_date": event_act["event_date"],
                            "start_time": start,
                            "end_time":   end,
                            "db_updated": updated,
                        }

            save_result({
                "file_id":          img["id"],
                "file_name":        img["name"],
                "drive_created_at": img.get("createdTime"),
                "processed_at":     datetime.now().isoformat(),
                "extracted":        extracted,
                "db":               db_result,
            })

            processed.add(img["id"])
            save_processed(processed)

        except Exception as e:
            print(f"  [✗] Fehler: {e}")
            processed.add(img["id"])
            save_processed(processed)

    return len(new_images)

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Drive → OpenAI → Supabase")
    parser.add_argument("--watch", action="store_true",
                        help=f"Alle {POLL_INTERVAL//60} Min automatisch prüfen")
    parser.add_argument("--interval", type=int, default=POLL_INTERVAL)
    args = parser.parse_args()

    if args.watch:
        print(f"[★] Watch-Modus aktiv (alle {args.interval//60} Min) — Ctrl+C zum Stoppen\n")
        while True:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Checking...")
            process_new_images()
            time.sleep(args.interval)
    else:
        process_new_images()
        print(f"\n[✓] Log: {OUTPUT_FILE}")