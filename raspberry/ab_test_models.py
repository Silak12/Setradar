"""
ab_test_models.py — A/B-Vergleich zweier OpenAI-Modelle auf denselben Story-Bildern

Beantwortet in einem Durchlauf:
  1. Wie viele Bild-Tokens kostet ein Call wirklich?  (greift detail:"low" bei
     patch-basierten Modellen, oder wird stur nach Patches abgerechnet?)
  2. Welche Parameter akzeptiert das Modell?  (max_tokens+temperature vs.
     max_completion_tokens+reasoning_effort)
  3. Wie viele Reasoning-Tokens verbrennt ein Reasoning-Modell pro Bild?
  4. Extrahieren beide Modelle dasselbe?
  5. Was kostet das hochgerechnet pro Monat?

Die Prompts werden per AST aus local_to_db.py gelesen — der Test läuft damit
immer gegen den echten Produktions-Prompt, ohne supabase/openai von dort zu
importieren.

Usage:
    python ab_test_models.py --images test_captures
    python ab_test_models.py --images captured_stories --limit 40
    python ab_test_models.py --models gpt-4.1-nano,gpt-5-nano --detail low
    python ab_test_models.py --report-only            # nur auswerten, keine Calls
"""
import os
import ast
import sys
import json
import time
import base64
import argparse
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Windows-Konsole faellt sonst ueber Box-Zeichen und Haken (cp1252)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# ── Preise ────────────────────────────────────────────────────────────────────
# USD pro 1M Token. Quelle: https://developers.openai.com/api/docs/pricing
# Stand: 2026-08-09 — bei Abweichungen hier nachziehen, sonst stimmt die
# Hochrechnung unten nicht mehr.
PRICES = {
    "gpt-4.1-nano": {"in": 0.10, "out": 0.40},
    "gpt-5-nano":   {"in": 0.05, "out": 0.40},
    "gpt-4.1-mini": {"in": 0.40, "out": 1.60},
    "gpt-5-mini":   {"in": 0.25, "out": 2.00},
}

DEFAULT_MODELS = ["gpt-4.1-nano", "gpt-5-nano"]
RESULTS_FILE   = Path(__file__).parent / "logs" / "ab_test_results.json"


# ── Produktions-Prompts einlesen ──────────────────────────────────────────────

def load_prompts() -> tuple[str, str]:
    """Holt SYSTEM_PROMPT und USER_PROMPT als Literale aus local_to_db.py."""
    src  = (Path(__file__).parent / "local_to_db.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    found = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if (isinstance(target, ast.Name)
                    and target.id in ("SYSTEM_PROMPT", "USER_PROMPT")
                    and isinstance(node.value, ast.Constant)):
                found[target.id] = node.value.value
    missing = {"SYSTEM_PROMPT", "USER_PROMPT"} - found.keys()
    if missing:
        raise RuntimeError(f"Prompt(s) nicht in local_to_db.py gefunden: {missing}")
    return found["SYSTEM_PROMPT"], found["USER_PROMPT"]


# ── Call mit Parameter-Fallback ───────────────────────────────────────────────
# Reasoning-Modelle (gpt-5-*) lehnen temperature/max_tokens ab, ältere Modelle
# kennen reasoning_effort nicht. Statt zu raten probieren wir die Varianten
# durch und protokollieren, welche durchging.

def _variants(model: str, max_out: int, reasoning_effort: str | None) -> list[dict]:
    modern = {"max_completion_tokens": max_out}
    if reasoning_effort:
        modern["reasoning_effort"] = reasoning_effort
    modern_plain = {"max_completion_tokens": max_out}
    legacy = {"max_tokens": max_out, "temperature": 0}
    # Reihenfolge nach Modellname raten, aber immer alle durchprobieren
    return ([modern, modern_plain, legacy] if model.startswith("gpt-5")
            else [legacy, modern_plain, modern])


def call_model(client: OpenAI, model: str, messages: list, max_out: int,
               reasoning_effort: str | None) -> dict:
    """Gibt {ok, text, usage, params_used, latency_s, error} zurück."""
    errors = []
    for kwargs in _variants(model, max_out, reasoning_effort):
        t0 = time.perf_counter()
        try:
            resp = client.chat.completions.create(model=model, messages=messages, **kwargs)
        except Exception as e:
            errors.append(f"{list(kwargs)} -> {type(e).__name__}: {str(e)[:160]}")
            continue
        latency = time.perf_counter() - t0
        u = resp.usage
        ctd = getattr(u, "completion_tokens_details", None)
        ptd = getattr(u, "prompt_tokens_details", None)
        return {
            "ok": True,
            "text": (resp.choices[0].message.content or "").strip(),
            "usage": {
                "prompt_tokens":     u.prompt_tokens,
                "completion_tokens": u.completion_tokens,
                "reasoning_tokens":  getattr(ctd, "reasoning_tokens", 0) or 0,
                "cached_tokens":     getattr(ptd, "cached_tokens", 0) or 0,
            },
            "params_used": sorted(kwargs),
            "latency_s": round(latency, 2),
            "error": None,
        }
    return {"ok": False, "text": "", "usage": None, "params_used": None,
            "latency_s": None, "error": " | ".join(errors)}


# ── Nachrichten bauen ─────────────────────────────────────────────────────────

def encode_image(path: Path, scale: float) -> tuple[bytes, tuple[int, int]]:
    """Bild als PNG-Bytes, optional runterskaliert. Gibt (bytes, (w,h)) zurueck."""
    if scale >= 0.999:
        from PIL import Image
        with Image.open(path) as im:
            return path.read_bytes(), im.size
    from io import BytesIO
    from PIL import Image
    with Image.open(path) as im:
        size = (max(1, int(im.width * scale)), max(1, int(im.height * scale)))
        resized = im.resize(size, Image.LANCZOS)
        buf = BytesIO()
        resized.save(buf, format="PNG")
        return buf.getvalue(), size


def build_messages(system_prompt: str, user_text: str,
                   image_bytes: bytes | None, detail: str | None) -> list:
    if image_bytes is None:
        return [{"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}]
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    image_part = {"type": "image_url",
                  "image_url": {"url": f"data:image/png;base64,{b64}"}}
    if detail:
        image_part["image_url"]["detail"] = detail
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": [image_part, {"type": "text", "text": user_text}]},
    ]


# ── JSON-Parsing (identisch zur Produktion) ───────────────────────────────────

def parse_reply(raw: str) -> dict | None:
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


# ── Testlauf ──────────────────────────────────────────────────────────────────

def run(images: list[Path], models: list[str], detail: str | None,
        max_out: int, reasoning_effort: str | None, scales: list[float]) -> dict:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
    system_prompt, user_prompt = load_prompts()

    run_data = {
        "config": {
            "models": models, "detail": detail, "max_out": max_out,
            "reasoning_effort": reasoning_effort, "n_images": len(images),
            "scales": scales,
            "note": "ohne OCR-Zusatztext, damit der Textanteil pro Call konstant ist",
        },
        "baseline": {}, "calls": [],
    }

    # Baseline: derselbe Prompt OHNE Bild → exakter Textanteil je Modell.
    # Bild-Tokens = prompt_tokens(mit Bild) - baseline. Damit ist die Frage
    # "greift detail:low?" direkt beantwortet, ohne Schaetzung.
    print("── Baseline (Text-Only, 1 Call je Modell) " + "─" * 26)
    for model in models:
        msgs = build_messages(system_prompt, user_prompt, None, None)
        r = call_model(client, model, msgs, max_out, reasoning_effort)
        if not r["ok"]:
            print(f"  {model:14} FEHLER: {r['error'][:200]}")
            run_data["baseline"][model] = None
            continue
        run_data["baseline"][model] = r["usage"]["prompt_tokens"]
        print(f"  {model:14} Text-Input = {r['usage']['prompt_tokens']:5} Tokens"
              f"   akzeptierte Parameter: {r['params_used']}")

    n_calls = len(images) * len(models) * len(scales)
    print(f"\n── {len(images)} Bild(er) x {len(models)} Modell(e) "
          f"x {len(scales)} Skalierung(en) = {n_calls} Calls " + "─" * 10)
    for img in images:
        print(f"\n  {img.name}")
        for scale in scales:
            img_bytes, size = encode_image(img, scale)
            kb = len(img_bytes) / 1024
            print(f"   scale={scale:<5} {size[0]}x{size[1]}  {kb:.0f} KB")
            for model in models:
                msgs = build_messages(system_prompt, user_prompt, img_bytes, detail)
                r = call_model(client, model, msgs, max_out, reasoning_effort)
                entry = {"image": img.name, "model": model, "scale": scale,
                         "size": list(size), **r}
                if r["ok"]:
                    parsed = parse_reply(r["text"])
                    entry["parsed"] = parsed
                    entry["parse_ok"] = parsed is not None
                    base = run_data["baseline"].get(model)
                    entry["image_tokens"] = (r["usage"]["prompt_tokens"] - base
                                             if base is not None else None)
                    u = r["usage"]
                    n_sets = len((parsed or {}).get("sets", []))
                    print(f"      {model:14} prompt={u['prompt_tokens']:5} "
                          f"(Bild {entry['image_tokens']:5}) "
                          f"out={u['completion_tokens']:4} "
                          f"reason={u['reasoning_tokens']:4} "
                          f"{r['latency_s']:5.2f}s  "
                          f"JSON={'ok' if parsed else 'FEHLER'}  sets={n_sets}")
                else:
                    entry["parsed"], entry["parse_ok"], entry["image_tokens"] = None, False, None
                    print(f"      {model:14} FEHLER: {r['error'][:200]}")
                run_data["calls"].append(entry)

    RESULTS_FILE.parent.mkdir(exist_ok=True)
    RESULTS_FILE.write_text(json.dumps(run_data, ensure_ascii=False, indent=2))
    print(f"\n[✓] Rohdaten: {RESULTS_FILE}")
    return run_data


# ── Auswertung ────────────────────────────────────────────────────────────────

def _names(parsed: dict | None) -> set:
    if not parsed:
        return set()
    return {str(s.get("name", "")).strip().lower()
            for s in parsed.get("sets", []) if s.get("name")}


def report(run_data: dict, per_day: int, days: int):
    calls  = run_data["calls"]
    models = run_data["config"]["models"]
    ok     = [c for c in calls if c["ok"]]

    print("\n" + "=" * 78)
    print("AUSWERTUNG")
    print("=" * 78)

    if not ok:
        print("\nKeine erfolgreichen Calls — nichts auszuwerten.")
        for c in calls[:3]:
            print(f"  {c['model']}: {c.get('error', '')[:300]}")
        return

    # ── Pro Modell x Skalierung: Tokens, Kosten ──────────────────────────────
    scales = run_data["config"].get("scales", [1.0])
    print(f"\n{'Modell':14} {'scale':>6} {'Bild-Tok':>9} {'Text-Tok':>9} {'Out-Tok':>8} "
          f"{'Reason':>7} {'JSON ok':>8} {'Latenz':>7} {'$/Monat':>9}")
    print("-" * 92)
    summary = {}
    for m in models:
      for sc in scales:
        rows = [c for c in ok if c["model"] == m and c.get("scale", 1.0) == sc]
        if not rows:
            if sc == scales[0]:
                print(f"{m:14} {'— alle Calls fehlgeschlagen —':>60}")
            continue
        n       = len(rows)
        img_tok = [c["image_tokens"] for c in rows if c["image_tokens"] is not None]
        avg_img = sum(img_tok) / len(img_tok) if img_tok else 0
        base    = run_data["baseline"].get(m) or 0
        avg_out = sum(c["usage"]["completion_tokens"] for c in rows) / n
        avg_rsn = sum(c["usage"]["reasoning_tokens"] for c in rows) / n
        avg_lat = sum(c["latency_s"] for c in rows) / n
        parse_ok = sum(1 for c in rows if c["parse_ok"])

        price = PRICES.get(m)
        if price:
            per_call = ((base + avg_img) * price["in"] + avg_out * price["out"]) / 1e6
            monthly  = per_call * per_day * days
            cost_str = f"${monthly:8.2f}"
        else:
            per_call, monthly, cost_str = None, None, "   n/a"

        summary[(m, sc)] = {"avg_image_tokens": round(avg_img), "text_tokens": base,
                            "avg_output_tokens": round(avg_out, 1),
                            "avg_reasoning_tokens": round(avg_rsn, 1),
                            "parse_ok": parse_ok, "n": n, "size": rows[0].get("size"),
                            "usd_per_call": per_call, "usd_per_month": monthly,
                            "params_used": rows[0]["params_used"]}
        print(f"{m:14} {sc:6.2f} {avg_img:9.0f} {base:9} {avg_out:8.1f} {avg_rsn:7.1f} "
              f"{parse_ok:>4}/{n:<3} {avg_lat:6.2f}s {cost_str}")

    print(f"\n  (Hochrechnung: {per_day} Bilder/Tag x {days} Tage, "
          f"Preise Stand 2026-08-09)")

    # ── Was die Bild-Tokens ueber detail:"low" verraten ──────────────────────
    detail = run_data["config"]["detail"]
    print(f"\n── Bild-Abrechnung (detail={detail!r}) " + "─" * 38)
    for (m, sc), s in summary.items():
        tok = s["avg_image_tokens"]
        if tok <= 200:
            verdict = "detail wird respektiert (Pauschale statt Patches)"
        elif tok >= 2000:
            verdict = "Patch-Abrechnung — detail hat KEINEN Effekt"
        else:
            verdict = "Patch-Abrechnung, Bild unter dem Budget"
        size = s.get("size") or ["?", "?"]
        print(f"  {m:14} scale={sc:<5} {size[0]}x{size[1]:<5} "
              f"{tok:>5} Bild-Tokens  →  {verdict}")

    # Ersparnis durch Skalierung
    base_key = next((k for k in summary if k[1] == max(sc for _, sc in summary)), None)
    if base_key and len(scales) > 1:
        base_month = summary[base_key]["usd_per_month"]
        if base_month:
            print(f"\n── Ersparnis durch Runterskalieren (Basis scale="
                  f"{base_key[1]}) " + "─" * 18)
            for (m, sc), s in summary.items():
                if s["usd_per_month"] is None:
                    continue
                delta = (1 - s["usd_per_month"] / base_month) * 100
                print(f"  {m:14} scale={sc:<5} ${s['usd_per_month']:7.2f}/Monat"
                      f"   {delta:+6.1f}%")

    # ── Akzeptierte Parameter ────────────────────────────────────────────────
    print("\n── Akzeptierte API-Parameter " + "─" * 45)
    for m in models:
        row = next((s for (mm, _), s in summary.items() if mm == m), None)
        print(f"  {m:14} {row['params_used'] if row else '— kein erfolgreicher Call —'}")

    # ── Uebereinstimmung der Extraktion ──────────────────────────────────────
    if len(models) == 2:
        a, b = models
        by_img = {}
        for c in ok:
            if c.get("scale", 1.0) != max(scales):
                continue   # Modellvergleich nur bei voller Aufloesung
            by_img.setdefault(c["image"], {})[c["model"]] = c
        both = {k: v for k, v in by_img.items() if a in v and b in v}
        print(f"\n── Uebereinstimmung {a} vs {b}  (n={len(both)}) " + "─" * 20)
        if not both:
            print("  Keine Bilder mit erfolgreichen Calls von BEIDEN Modellen — "
                  "Vergleich nicht moeglich.")
            print("\n" + "=" * 78)
            return
        agree_type = agree_date = agree_names = 0
        diffs = []
        for name, pair in sorted(both.items()):
            pa, pb = pair[a].get("parsed"), pair[b].get("parsed")
            ta = (pa or {}).get("type"); tb = (pb or {}).get("type")
            da = (pa or {}).get("date_hint"); db = (pb or {}).get("date_hint")
            na, nb = _names(pa), _names(pb)
            if ta == tb:  agree_type += 1
            if da == db:  agree_date += 1
            if na == nb:  agree_names += 1
            else:
                diffs.append((name, sorted(na - nb), sorted(nb - na)))
        tot = len(both) or 1
        print(f"  type       gleich: {agree_type}/{tot}")
        print(f"  date_hint  gleich: {agree_date}/{tot}")
        print(f"  Namen-Set  gleich: {agree_names}/{tot}")
        for name, only_a, only_b in diffs[:10]:
            print(f"    {name}")
            if only_a: print(f"      nur {a}: {only_a}")
            if only_b: print(f"      nur {b}: {only_b}")

    print("\n" + "=" * 78)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="A/B-Vergleich OpenAI-Modelle auf Story-Bildern")
    ap.add_argument("--images", default="test_captures",
                    help="Ordner mit Bildern (default: test_captures)")
    ap.add_argument("--models", default=",".join(DEFAULT_MODELS))
    ap.add_argument("--limit", type=int, default=0, help="max. Anzahl Bilder (0=alle)")
    ap.add_argument("--detail", default="low",
                    help="Bild-Detailstufe: low|high|auto|none (none = Parameter weglassen)")
    ap.add_argument("--scales", default="1.0",
                    help="Bild-Skalierungen, komma-getrennt, z.B. 1.0,0.6,0.4")
    ap.add_argument("--max-out", type=int, default=400)
    ap.add_argument("--reasoning-effort", default="minimal",
                    help="nur fuer Reasoning-Modelle; 'none' zum Weglassen")
    ap.add_argument("--per-day", type=int, default=1000, help="Bilder/Tag fuer die Hochrechnung")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--report-only", action="store_true",
                    help="nur vorhandene ab_test_results.json auswerten")
    args = ap.parse_args()

    if args.report_only:
        if not RESULTS_FILE.exists():
            print(f"[✗] {RESULTS_FILE} existiert nicht — erst einen Lauf starten.")
            return
        report(json.loads(RESULTS_FILE.read_text()), args.per_day, args.days)
        return

    if not os.getenv("OPENAI_API_KEY"):
        print("[✗] OPENAI_API_KEY nicht gesetzt (.env im Repo-Root).")
        return

    folder = Path(args.images)
    if not folder.is_absolute():
        folder = Path(__file__).parent / folder
    images = sorted([p for p in folder.glob("*")
                     if p.suffix.lower() in (".png", ".jpg", ".jpeg")])
    if args.limit:
        images = images[:args.limit]
    if not images:
        print(f"[✗] Keine Bilder in {folder}")
        return

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    detail = None if args.detail.lower() == "none" else args.detail
    effort = None if args.reasoning_effort.lower() == "none" else args.reasoning_effort
    scales = sorted({float(s) for s in args.scales.split(",") if s.strip()}, reverse=True)

    data = run(images, models, detail, args.max_out, effort, scales)
    report(data, args.per_day, args.days)


if __name__ == "__main__":
    main()
