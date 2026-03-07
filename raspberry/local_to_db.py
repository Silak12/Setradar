"""
setradar - local_to_db.py
--------------------------
1. Liest neue Bilder aus captured_stories/ (lokal auf dem Pi)
2. Extrahiert per OpenAI Vision: Artist-Namen, Set-Zeiten, B2B, Cancellations
3. Matched Namen gegen acts.insta_name + acts.name in Supabase
4. Schreibt start_time / end_time ins nächste Event – überschreibt KEINE bestehenden Zeiten
5. Löscht verarbeitete Bilder lokal

Umgebungsvariablen (.env):
    OPENAI_API_KEY               = sk-...
    SUPABASE_URL                 = https://xxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    = eyJ...

Usage:
    python local_to_db.py
    python local_to_db.py --watch
"""

import os
import json
import time
import base64
import argparse
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client, Client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# ── Config ────────────────────────────────────────────────────────────────────

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
SUPABASE_URL   = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

STORIES_FOLDER          = Path(__file__).parent / "captured_stories"
PROCESSED_LOG           = Path(__file__).parent / "logs" / "processed_files.json"
OUTPUT_FILE             = Path(__file__).parent / "logs" / "timetable_results.json"
POLL_INTERVAL           = 300
DELETE_AFTER_PROCESSING = True

# ── Prompt ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You extract DJ/artist timetable information from Instagram story images.
Always reply with valid JSON only, no explanation."""

USER_PROMPT = """\
Analyze this Instagram story image and extract any timetable or set time information.

Return exactly this JSON structure:
{
  "type": "<one of: timetable | single_set | cancellation | irrelevant>",
  "sets": [
    {
      "name": "<artist or act name as shown in the image>",
      "start": "<set start time HH:MM or null>",
      "end": "<set end time HH:MM or null>",
      "canceled": <true if this act is announced as not performing, else false>,
      "b2b": ["<name of b2b partner if any, else empty array>"]
    }
  ]
}

Type definitions:
- "timetable": image shows multiple acts with times (full lineup/schedule)
- "single_set": image shows one act with a set time (e.g. own story with set time)
- "cancellation": an act is announced as canceled, sick, not performing tonight
- "irrelevant": no timetable or set time information

Rules:
- Extract all acts if it's a full timetable
- For B2B / b2b / vs. / f2f: include both names, put partner(s) in the "b2b" array
- Use the name exactly as shown (not @handle, just the visible name or handle)
- If it's the account's own story showing their set time, use their visible name or handle
- Only extract times that clearly refer to a DJ/live set performance
- For cancellations: include the act name and set canceled=true, times can be null
- If irrelevant, return an empty sets array"""

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
    PROCESSED_LOG.parent.mkdir(exist_ok=True)
    PROCESSED_LOG.write_text(json.dumps(list(processed)))

# ── OpenAI Vision ─────────────────────────────────────────────────────────────

def analyze_image(client: OpenAI, image_path: Path) -> dict:
    b64  = base64.b64encode(image_path.read_bytes()).decode("utf-8")

    response = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "low"}},
                    {"type": "text", "text": USER_PROMPT},
                ]
            }
        ],
        max_tokens=400,
        temperature=0,
    )

    raw = response.choices[0].message.content.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        data = json.loads(raw)
        # Normalisiere: stelle sicher dass sets immer eine Liste ist
        if "sets" not in data:
            data["sets"] = []
        for s in data["sets"]:
            s.setdefault("start", None)
            s.setdefault("end", None)
            s.setdefault("canceled", False)
            s.setdefault("b2b", [])
        return data
    except json.JSONDecodeError:
        print(f"  [!] JSON Parse Fehler: {raw[:200]}")
        return {"type": "irrelevant", "sets": []}

# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def find_act(sb: Client, name: str) -> dict | None:
    """Sucht Act: zuerst per insta_name, dann per name (case-insensitive)."""
    if not name:
        return None

    # 1. Exakter Match auf insta_name
    res = sb.table("acts").select("id, name, insta_name").ilike("insta_name", name).limit(1).execute()
    if res.data:
        return res.data[0]

    # 2. Exakter Match auf name
    res = sb.table("acts").select("id, name, insta_name").ilike("name", name).limit(1).execute()
    if res.data:
        return res.data[0]

    # 3. Enthält-Match auf name (z.B. "DJ XY b2b YZ" → "DJ XY")
    res = sb.table("acts").select("id, name, insta_name").ilike("name", f"%{name}%").limit(1).execute()
    return res.data[0] if res.data else None


def find_next_event_act(sb: Client, act_id: int) -> dict | None:
    today = date.today().isoformat()

    res = sb.table("event_acts").select("id, event_id, start_time, end_time").eq("act_id", act_id).execute()
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


def write_set_time(sb: Client, event_act_id: int, start: str | None, end: str | None,
                   current_start: str | None, current_end: str | None,
                   canceled: bool = False) -> str:
    """
    Schreibt Zeiten in DB.
    - Bestehende Zeiten werden NICHT überschrieben (außer canceled=True).
    - Gibt zurück: 'written' | 'skipped' | 'canceled' | 'no_data'
    """
    if canceled:
        # Cancellation immer schreiben – auch wenn Zeiten bereits vorhanden
        sb.table("event_acts").update({"canceled": True}).eq("id", event_act_id).execute()
        print(f"  [!] CANCELED – in DB eingetragen")
        return "canceled"

    if current_start or current_end:
        print(f"  [→] Zeiten bereits vorhanden ({current_start}–{current_end}), überspringe")
        return "skipped"

    payload: dict = {}
    if start:
        payload["start_time"] = start
    if end:
        payload["end_time"] = end
    if not payload:
        return "no_data"

    sb.table("event_acts").update(payload).eq("id", event_act_id).execute()
    return "written"


# ── Einen Set verarbeiten ──────────────────────────────────────────────────────

def process_set(sb: Client, set_data: dict) -> dict:
    """Verarbeitet einen einzelnen Set aus dem extracted data. Gibt DB-Result zurück."""
    name     = set_data.get("name", "").strip()
    start    = set_data.get("start")
    end      = set_data.get("end")
    canceled = set_data.get("canceled", False)
    b2b      = set_data.get("b2b", [])

    if not name:
        return {"matched": False, "reason": "no name"}

    act = find_act(sb, name)
    if not act:
        print(f"  [–] Kein Act gefunden für '{name}'")
        result = {"matched": False, "name": name, "reason": "unknown act"}
    else:
        print(f"  [✓] Act: {act['name']} (id={act['id']})")
        event_act = find_next_event_act(sb, act["id"])
        if not event_act:
            print(f"  [–] Kein zukünftiges Event für {act['name']}")
            result = {"matched": True, "act": act["name"], "reason": "no upcoming event"}
        else:
            print(f"  [✓] Event: {event_act['event_name']} am {event_act['event_date']}")
            status = write_set_time(
                sb, event_act["id"], start, end,
                event_act.get("start_time"), event_act.get("end_time"),
                canceled=canceled
            )
            print(f"  [✓] DB: {start}–{end} → {status}")
            result = {
                "matched":    True,
                "act":        act["name"],
                "event":      event_act["event_name"],
                "event_date": event_act["event_date"],
                "start_time": start,
                "end_time":   end,
                "canceled":   canceled,
                "db_status":  status,
            }

    # B2B-Partner ebenfalls verarbeiten
    for partner_name in b2b:
        print(f"  [b2b] Verarbeite Partner: {partner_name}")
        partner_act = find_act(sb, partner_name)
        if not partner_act:
            print(f"  [–] B2B-Partner '{partner_name}' nicht gefunden")
            continue
        partner_event_act = find_next_event_act(sb, partner_act["id"])
        if not partner_event_act:
            print(f"  [–] Kein Event für B2B-Partner {partner_act['name']}")
            continue
        status = write_set_time(
            sb, partner_event_act["id"], start, end,
            partner_event_act.get("start_time"), partner_event_act.get("end_time"),
            canceled=canceled
        )
        print(f"  [b2b] {partner_act['name']}: {start}–{end} → {status}")

    return result


# ── Results speichern ─────────────────────────────────────────────────────────

def save_result(result: dict):
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
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
    if not OPENAI_API_KEY:
        print("[✗] OPENAI_API_KEY nicht gesetzt!")
        return 0
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[✗] SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY nicht gesetzt!")
        return 0

    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    sb            = get_supabase()
    processed     = load_processed()

    all_images = sorted(STORIES_FOLDER.glob("story_*.png"))
    new_images = [f for f in all_images if f.name not in processed]

    if not new_images:
        if verbose:
            print(f"[✓] Keine neuen Bilder. ({len(all_images)} im Ordner)")
        return 0

    print(f"[→] {len(new_images)} neue Bild(er) gefunden...")

    for img_path in new_images:
        print(f"\n── {img_path.name} ──")
        try:
            extracted = analyze_image(openai_client, img_path)
            story_type = extracted.get("type", "irrelevant")
            sets       = extracted.get("sets", [])

            print(f"  Typ: {story_type} | {len(sets)} Set(s) erkannt")

            if story_type == "irrelevant" or not sets:
                processed.add(img_path.name)
                save_processed(processed)
                if DELETE_AFTER_PROCESSING:
                    img_path.unlink()
                continue

            db_results = []
            for set_data in sets:
                res = process_set(sb, set_data)
                db_results.append(res)

            save_result({
                "file_name":    img_path.name,
                "processed_at": datetime.now().isoformat(),
                "story_type":   story_type,
                "extracted":    sets,
                "db":           db_results,
            })

            processed.add(img_path.name)
            save_processed(processed)

            if DELETE_AFTER_PROCESSING:
                img_path.unlink()

        except Exception as e:
            print(f"  [✗] Fehler: {e}")
            processed.add(img_path.name)
            save_processed(processed)

    return len(new_images)

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local Stories → OpenAI → Supabase")
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
