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
import re
import json
import time
import base64
import argparse
import difflib
from datetime import date, datetime
from pathlib import Path

import numpy as np
from PIL import Image
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

# ── OCR Pre-Filter ────────────────────────────────────────────────────────────
# Nur Bilder mit Uhrzeiten oder Cancel-Keywords an OpenAI schicken

_TIME_RE      = re.compile(r"\b\d{1,2}:\d{2}\b")
_CANCEL_KW    = ["cancel", "cancelled", "canceled", "sick", "ill", "leider",
                 "absagt", "abgesagt", "fällt aus", "not perform"]
_CROP_TOP_PX  = 80    # Statusbar oben abschneiden
_EXCLUDE_ZONE = {"x1": 900, "y1": 0, "x2": 1080, "y2": 400}  # Video-Timer oben rechts

_ocr_reader = None

def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(["en", "de"], gpu=False, verbose=False)
    return _ocr_reader


def ocr_prefilter(img_path: Path) -> bool:
    """
    Gibt True zurück wenn das Bild Zeiten (21:00) oder Cancel-Keywords enthält
    und damit an OpenAI geschickt werden soll.
    False = irrelevant, überspringen.
    """
    try:
        img    = Image.open(img_path)
        w, h   = img.size
        crop   = int(_CROP_TOP_PX * h / 2340)
        arr    = np.array(img.crop((0, crop, w, h)))
        results = _get_ocr_reader().readtext(arr, detail=1, paragraph=False)

        time_texts = []
        full_text  = []
        for (bbox, text, _) in results:
            pts = np.array(bbox, dtype=np.int32)
            pts[:, 1] += crop
            x1, y1 = int(pts[0][0]), int(pts[0][1])
            x2, y2 = int(pts[2][0]), int(pts[2][1])
            excluded = (x1 >= _EXCLUDE_ZONE["x1"] and y1 >= _EXCLUDE_ZONE["y1"]
                        and x2 <= _EXCLUDE_ZONE["x2"] and y2 <= _EXCLUDE_ZONE["y2"])
            if not excluded:
                time_texts.append(text)
            full_text.append(text)

        has_time   = bool(_TIME_RE.search(" ".join(time_texts)))
        has_cancel = any(kw in " ".join(full_text).lower() for kw in _CANCEL_KW)
        return has_time or has_cancel

    except Exception as e:
        print(f"  [OCR] Fehler: {e} – sende sicherheitshalber an OpenAI")
        return True

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

# ── Name-Cleaning ─────────────────────────────────────────────────────────────

# Slot-Labels die kein Teil des DJ-Namens sind (z.B. "END LOUCHI" → "LOUCHI")
_STRIP_PREFIXES = ["END ", "OPENING ", "CLOSING ", "WARM-UP ", "WARM UP ", "OPEN ", "START "]

def clean_name(name: str) -> str:
    s = name.strip()
    upper = s.upper()
    for prefix in _STRIP_PREFIXES:
        if upper.startswith(prefix):
            return s[len(prefix):].strip()
    return s


# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def find_act(sb: Client, name: str) -> dict | None:
    """
    Sucht Act mit 4 Stufen:
    1+2. Exakter Match auf insta_name / name (original + cleaned)
    3.   DB-Name enthält Suchname (LIKE %name%)
    4.   Reverse: Suchname enthält DB-Namen (z.B. "END LOUCHI" → "LOUCHI")
    """
    if not name:
        return None

    candidates = list(dict.fromkeys([name.strip(), clean_name(name)]))

    for n in candidates:
        if not n:
            continue
        res = sb.table("acts").select("id, name, insta_name").ilike("insta_name", n).limit(1).execute()
        if res.data:
            return res.data[0]

        res = sb.table("acts").select("id, name, insta_name").ilike("name", n).limit(1).execute()
        if res.data:
            return res.data[0]

        res = sb.table("acts").select("id, name, insta_name").ilike("name", f"%{n}%").limit(1).execute()
        if res.data:
            return res.data[0]

    # Stufe 4: Reverse-Contains – DB-Name ist Teilstring des extrahierten Namens
    # Fängt Fälle wie "END LOUCHI" → "LOUCHI" ab, die clean_name nicht kennt
    name_lower = name.strip().lower()
    all_acts = sb.table("acts").select("id, name, insta_name").execute()
    for act in all_acts.data:
        for field in [act.get("name") or "", act.get("insta_name") or ""]:
            if len(field) > 3 and field.lower() in name_lower:
                return act

    return None


def find_anchor_event(sb: Client, act_ids: list) -> int | None:
    """
    Findet das Event das bei den meisten Acts aus einem Bild vorkommt.
    Gibt event_id zurück wenn ≥2 Acts dasselbe nächste Event teilen.
    Nutzt Event-Kontext um Ungematchte besser zuzuordnen.
    """
    if not act_ids:
        return None

    event_counts: dict = {}
    event_names: dict  = {}
    for act_id in act_ids:
        ea = find_next_event_act(sb, act_id)
        if ea:
            eid = ea["event_id"]
            event_counts[eid] = event_counts.get(eid, 0) + 1
            event_names[eid]  = ea["event_name"]

    if not event_counts:
        return None

    best_id = max(event_counts, key=lambda k: event_counts[k])
    print(f"  [★] Anchor-Event: '{event_names[best_id]}' "
          f"({event_counts[best_id]}/{len(act_ids)} Acts bestätigt)")
    return best_id


def fuzzy_match_in_event(sb: Client, name: str, event_id: int) -> dict | None:
    """
    Sucht einen Act gezielt unter den Acts des Anchor-Events.
    Nutzt Reverse-Contains + difflib-Fuzzy als Fallback (≥65% Ähnlichkeit).
    """
    res = sb.table("event_acts").select("act_id").eq("event_id", event_id).execute()
    if not res.data:
        return None

    act_ids  = [r["act_id"] for r in res.data]
    acts_res = sb.table("acts").select("id, name, insta_name").in_("id", act_ids).execute()
    acts     = acts_res.data
    if not acts:
        return None

    candidates = list(dict.fromkeys([name.strip().lower(), clean_name(name).lower()]))

    for search in candidates:
        if not search:
            continue
        for act in acts:
            act_name  = (act.get("name")       or "").lower()
            act_insta = (act.get("insta_name") or "").lower()
            for field in [act_name, act_insta]:
                if not field:
                    continue
                if search == field or search in field:
                    return act
                if len(field) > 3 and field in search:
                    return act

    # Fuzzy-Fallback via difflib
    best_ratio, best_act = 0.0, None
    for search in candidates:
        if not search:
            continue
        for act in acts:
            for field in [act.get("name") or "", act.get("insta_name") or ""]:
                if not field:
                    continue
                ratio = difflib.SequenceMatcher(None, search, field.lower()).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_act   = act

    if best_ratio >= 0.65:
        print(f"  [~] Fuzzy via Anchor: '{name}' → '{best_act['name']}' ({best_ratio:.0%})")
        return best_act

    return None


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

def process_set(sb: Client, set_data: dict, act: dict | None = None) -> dict:
    """
    Verarbeitet einen Set. Optionaler act-Parameter erlaubt vorgematchten Act
    aus der zweiphasigen Verarbeitung zu übergeben.
    """
    name     = set_data.get("name", "").strip()
    start    = set_data.get("start")
    end      = set_data.get("end")
    canceled = set_data.get("canceled", False)
    b2b      = set_data.get("b2b", [])

    if not name:
        return {"matched": False, "reason": "no name"}

    if act is None:
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
            # OCR Pre-Filter: nur Bilder mit Zeiten/Cancel-Keywords an OpenAI
            if not ocr_prefilter(img_path):
                print(f"  [OCR] Kein Timetable-Inhalt – überspringe OpenAI")
                processed.add(img_path.name)
                save_processed(processed)
                if DELETE_AFTER_PROCESSING:
                    img_path.unlink()
                continue

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

            # Phase 1: Alle Acts matchen
            phase1 = []
            for set_data in sets:
                act = find_act(sb, set_data.get("name", ""))
                phase1.append((set_data, act))

            # Phase 2: Anchor-Event aus gematchten Acts bestimmen
            matched_act_ids = [act["id"] for _, act in phase1 if act]
            anchor_event_id = find_anchor_event(sb, matched_act_ids)

            # Phase 3: Ungematchte nochmal gezielt gegen Anchor-Event versuchen
            final_sets = []
            for set_data, act in phase1:
                if act is None and anchor_event_id:
                    name = set_data.get("name", "")
                    act  = fuzzy_match_in_event(sb, name, anchor_event_id)
                    if act:
                        print(f"  [~] Via Anchor gefunden: '{name}' → '{act['name']}'")
                final_sets.append((set_data, act))

            # Phase 4: In DB schreiben
            db_results = []
            for set_data, act in final_sets:
                res = process_set(sb, set_data, act)
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
