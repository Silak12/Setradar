"""
Instagram Story Bot – Crontab-Version
Läuft 1x/Stunde via Crontab, beendet sich nach SCRAPE_DURATION Minuten.
Startet mit zufälligem Delay (0–25 Min) damit der Login-Rhythmus unregelmäßig wirkt.
Ruft am Ende automatisch post_process.py auf (dedup + Drive-Upload).

Crontab (einziger Eintrag):
  0 * * * * cd /home/pi/Lineup-Berlin/raspberry && .venv/bin/python main.py >> logs/cron.log 2>&1

Schlafzeit: 00:30–10:00 → wird übersprungen.
"""
import os
import time
import random
import logging
import logging.handlers
import yaml
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

import uiautomator2 as u2

from bot.human import HumanBehavior
from bot.vision import StoryVision
from bot.stories import StoryCapture

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent


def setup_logging(cfg):
    Path("logs").mkdir(exist_ok=True)
    level = getattr(logging, cfg["logging"]["level"])
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(level=level, format=fmt)
    fh = logging.handlers.RotatingFileHandler(
        cfg["logging"]["log_file"], maxBytes=5_000_000, backupCount=3)
    fh.setFormatter(logging.Formatter(fmt))
    logging.getLogger().addHandler(fh)


def load_config():
    load_dotenv(dotenv_path=ROOT_DIR / ".env")
    with (BASE_DIR / "config.yaml").open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg


def connect_device(cfg):
    device_id = cfg.get("adb_device", "")
    return u2.connect(device_id) if device_id else u2.connect()


def _to_minutes(val):
    """'HH:MM' oder Stunden-Zahl → Minuten seit Mitternacht."""
    if isinstance(val, str) and ":" in val:
        h, m = val.split(":")
        return int(h) * 60 + int(m)
    return int(val) * 60


def _in_window(now_minutes, start, end):
    """True wenn now im Fenster [start, end) liegt – mit Mitternacht-Übergang."""
    if start < end:
        return start <= now_minutes < end
    return now_minutes >= start or now_minutes < end


def is_sleep_time(cfg):
    """Gibt True zurück wenn gerade Schlafzeit ist (unterstützt HH:MM Format)."""
    b = cfg["behavior"]
    now = datetime.now()
    now_minutes = now.hour * 60 + now.minute
    start = _to_minutes(b.get("sleep_start", "0:30"))
    end   = _to_minutes(b.get("sleep_end",   "10:00"))
    return _in_window(now_minutes, start, end)


def should_skip_session(cfg, log):
    """
    Zufalls-Skip: lässt manche Stunden komplett aus → unregelmäßiger,
    menschlicherer Rhythmus statt striktem Stundentakt.
    Ab no_skip_after (Prime-Time, default 19:00) bis sleep_start wird NIE geskippt.
    """
    b = cfg["behavior"]
    chance = float(b.get("skip_chance", 0.0))
    if chance <= 0:
        return False
    now = datetime.now()
    now_minutes = now.hour * 60 + now.minute
    no_skip     = _to_minutes(b.get("no_skip_after", "19:00"))
    sleep_start = _to_minutes(b.get("sleep_start", "0:30"))
    if _in_window(now_minutes, no_skip, sleep_start):
        return False  # Prime-Time: immer laufen
    if random.random() < chance:
        log.info(f"Zufalls-Skip dieser Stunde ({chance:.0%} Chance) – nächster Lauf zur nächsten vollen Stunde")
        return True
    return False


def acquire_lock(log):
    """
    Verhindert dass zwei main.py-Instanzen parallel laufen (non-blocking flock).
    Gibt das offene Lock-File zurück (muss bis Prozessende referenziert bleiben)
    oder None wenn bereits eine Instanz läuft.
    """
    lock_path = BASE_DIR / "logs" / "main.lock"
    lock_path.parent.mkdir(exist_ok=True)
    f = open(lock_path, "w")
    try:
        import fcntl
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except ImportError:
        pass  # Windows/Dev: kein flock verfügbar
    except OSError:
        f.close()
        return None
    f.write(str(os.getpid()))
    f.flush()
    return f


def start_instagram_fresh(device, log):
    """Stoppt und startet Instagram neu – landet garantiert auf Home-Feed."""
    device.app_stop("com.instagram.android")
    time.sleep(2)
    device.app_start("com.instagram.android")
    time.sleep(6)
    cur = device.app_current()
    if "instagram" not in cur.get("package", "").lower():
        log.error("Instagram startet nicht!")
        return False
    log.info("Instagram gestartet (Home-Feed)")
    return True


def check_stories_with_retry(device, vision, human, log):
    """
    Prüft ob Stories vorhanden sind – mit zweistufigem Retry:
    1. Pull-to-Refresh + 7s warten → nochmal checken
    2. Instagram neu starten + kurz warten → nochmal checken
    Gibt True zurück wenn Stories gefunden, False wenn definitiv keine da.
    """
    # Stufe 1: Refresh und nochmal warten
    log.info("Keine Stories – Pull-to-Refresh und nochmal prüfen...")
    human.pull_to_refresh()
    time.sleep(7)
    img = vision.screenshot_to_numpy(device)
    if img is not None and vision.has_unseen_stories(img):
        log.info("Stories nach Refresh gefunden!")
        return True

    # Stufe 2: Instagram komplett neu starten
    log.info("Immer noch keine Stories – starte Instagram neu...")
    device.app_stop("com.instagram.android")
    time.sleep(3)
    device.app_start("com.instagram.android")
    time.sleep(6)
    img = vision.screenshot_to_numpy(device)
    if img is not None and vision.has_unseen_stories(img):
        log.info("Stories nach Neustart gefunden!")
        return True

    log.info("Definitiv keine Stories – beende Session")
    return False


def main():
    cfg = load_config()
    setup_logging(cfg)
    log = logging.getLogger("main")

    # ── Lock: keine zweite Instanz parallel ──────────────────────────────────
    lock = acquire_lock(log)
    if lock is None:
        log.info("Andere main.py-Instanz läuft noch – Abbruch")
        return

    # ── Schlafzeit-Check VOR dem Delay ───────────────────────────────────────
    if is_sleep_time(cfg):
        log.info(f"Schlafzeit ({cfg['behavior'].get('sleep_start','0:30')}–"
                 f"{cfg['behavior'].get('sleep_end','10:00')}) – nichts zu tun")
        return

    # ── Zufalls-Skip (nur außerhalb der Prime-Time) ──────────────────────────
    if should_skip_session(cfg, log):
        return

    # ── Zufälliger Start-Delay (0–25 Min) ────────────────────────────────────
    b = cfg["behavior"]
    delay_min = b.get("startup_delay_min", 0)
    delay_max = b.get("startup_delay_max", 25)
    startup_delay = random.uniform(delay_min * 60, delay_max * 60)
    log.info(f"=== Story Bot: warte {startup_delay/60:.1f} Min vor Start ===")
    time.sleep(startup_delay)

    # Nochmal prüfen ob wir nach dem Delay noch außerhalb der Schlafzeit sind
    if is_sleep_time(cfg):
        log.info("Nach Delay in Schlafzeit geraten – Abbruch")
        return

    # ── Setup ─────────────────────────────────────────────────────────────────
    # Scrape-Dauer zufällig variieren → kein maschinenhaft konstantes Muster
    dur_lo = b.get("scrape_duration_min", 25)
    dur_hi = b.get("scrape_duration_max", dur_lo)
    scrape_duration = random.uniform(dur_lo, dur_hi) * 60
    shots_min       = b.get("mini_session_shots_min", 15)
    shots_max       = b.get("mini_session_shots_max", 20)
    pause_min       = b.get("mini_session_pause_min", 10)
    pause_max       = b.get("mini_session_pause_max", 30)

    log.info(f"=== Scraping startet ({scrape_duration//60} Min) ===")

    device = connect_device(cfg)
    device.screen_on()
    log.info(f"Phone: {device.device_info['brand']} {device.device_info['model']}")

    human   = HumanBehavior(device, cfg)
    vision  = StoryVision()
    stories = StoryCapture(device, vision, human, cfg)

    if not start_instagram_fresh(device, log):
        return

    session_start  = time.time()
    total_captured = 0
    mini_sessions  = 0

    while time.time() - session_start < scrape_duration:
        elapsed   = (time.time() - session_start) / 60
        remaining = (scrape_duration - (time.time() - session_start)) / 60
        log.info(f"[{elapsed:.0f}/{scrape_duration//60}min] "
                 f"{total_captured} Shots – {remaining:.0f} Min übrig")

        try:
            if is_sleep_time(cfg):
                log.info("Schlafzeit während Session – beende")
                break

            img = vision.screenshot_to_numpy(device)
            if img is None or not vision.has_unseen_stories(img):
                if not check_stories_with_retry(device, vision, human, log):
                    device.app_stop("com.instagram.android")
                    break
                img = vision.screenshot_to_numpy(device)

            # Stories klassifizieren: followed vs suggested
            followed, suggested, total = vision.count_story_avatars(img)

            if total == 0 or (suggested == total and total > 0):
                log.info(f"Nur noch suggested Stories ({suggested}/{total}) – beende Session")
                device.app_stop("com.instagram.android")
                break

            # Wenige followed Stories übrig → kürzere Session
            if followed <= 2:
                shots = random.randint(8, 10)
                log.info(f"Nur noch {followed} followed – reduziere auf {shots} Shots")
            else:
                shots = random.randint(shots_min, shots_max)

            log.info(f"Mini-Session #{mini_sessions + 1}: max {shots} Shots "
                     f"({followed} followed, {suggested} suggested)")

            count = stories.run_mini_session(max_shots=shots)
            total_captured += count
            mini_sessions  += 1
            log.info(f"Mini-Session #{mini_sessions}: {count} Shots "
                     f"(gesamt {total_captured})")

            # Optional: Feed scrollen (menschliches Verhalten, 50% Chance)
            if random.random() < 0.5:
                log.info("Feed-Scroll zwischen Sessions...")
                human.scroll_feed_light()

            # Vor jeder neuen Mini-Session Instagram neu starten → safe auf Home Feed
            start_instagram_fresh(device, log)

            pause = random.uniform(pause_min, pause_max)
            log.info(f"Pause {pause:.0f}s...")
            time.sleep(pause)

        except KeyboardInterrupt:
            log.info("Manuell gestoppt")
            break
        except Exception as e:
            log.error(f"Fehler: {e}", exc_info=True)
            try:
                start_instagram_fresh(device, log)
            except Exception:
                time.sleep(30)

    log.info(f"=== Session beendet: {total_captured} Shots, "
             f"{mini_sessions} Mini-Sessions ===")

    # ── Post-Processing: dedup + Drive-Upload ────────────────────────────────
    # Immer aufrufen – auch wenn 0 neue Shots (könnten noch alte Dateien liegen)
    log.info("Starte post_process.py...")
    try:
        import post_process
        post_process.main()
    except Exception as e:
        log.error(f"post_process fehlgeschlagen: {e}", exc_info=True)


if __name__ == "__main__":
    main()
