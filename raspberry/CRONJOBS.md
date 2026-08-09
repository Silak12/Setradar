# Setradar — Cronjobs auf dem Raspberry Pi

Alle Pfade gehen davon aus, dass das Repo unter `/home/pi/Setradar` liegt.
Falls anders: alle Pfade entsprechend anpassen.

## Installation

```bash
crontab -e
```

Und die Blöcke unten am Ende der Datei einfügen.

## Cronjob-Block (copy-paste)

```cron
# ── Setradar ─────────────────────────────────────────────────────────────────
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SETRADAR=/home/pi/Setradar
PY=/home/pi/Setradar/.venv/bin/python

# Instagram-Story-Bot — jede Stunde zur Minute 0
# (startet mit Random-Delay 0–10 Min, läuft ~45 Min, ruft danach post_process auf)
0 * * * * cd $SETRADAR/raspberry && $PY main.py >> $SETRADAR/raspberry/logs/cron.log 2>&1

# Post-Processing Fallback — falls main.py abgestürzt ist, trotzdem dedupen + upload
35 * * * * cd $SETRADAR/raspberry && $PY post_process.py >> $SETRADAR/raspberry/logs/post_process.log 2>&1

# Resident-Advisor-Scraper — 2x täglich Events + Lineups holen
15 6,18 * * * cd $SETRADAR && $PY -m backend.fetcher.ra_scraper >> $SETRADAR/raspberry/logs/ra_scraper.log 2>&1

# Log-Rotation — logs > 5 MB kappen (jede Nacht 03:15)
15 3 * * * find $SETRADAR/raspberry/logs -type f -size +5M -exec truncate -s 0 {} \;
```

## Kontrolle

```bash
# aktive Cronjobs anzeigen
crontab -l

# Live-Logs mitlesen
tail -f /home/pi/Setradar/raspberry/logs/cron.log
tail -f /home/pi/Setradar/raspberry/logs/post_process.log
tail -f /home/pi/Setradar/raspberry/logs/ra_scraper.log

# Manuell einen Job testen (ohne auf Cron zu warten)
cd /home/pi/Setradar/raspberry && /home/pi/Setradar/.venv/bin/python main.py
cd /home/pi/Setradar && /home/pi/Setradar/.venv/bin/python -m backend.fetcher.ra_scraper --dry-run
```

## Update auf neue Repo-Version

```bash
cd /home/pi/Setradar && bash raspberry/install.sh
```

`install.sh` macht `git pull` und synct die venv-Dependencies — Cronjobs müssen
nur bei Neuzugängen (neue Skripte) angepasst werden.

## Fehlerbilder

| Symptom | Ursache | Fix |
|---|---|---|
| `command not found: python` in Cron-Log | falscher `PY`-Pfad | `which python3` prüfen, `PY=` anpassen |
| `adb: no devices` | Phone nicht verbunden / USB-Debug aus | `adb devices` manuell prüfen |
| Story-Bot läuft, aber keine Bilder | Instagram ausgeloggt / Rate-Limit | manuell einloggen, dann `main.py` testen |
| RA-Scraper: `Missing SUPABASE_URL` | `.env` fehlt oder Cron liest es nicht | Cron-Block oben nutzt `cd` ins Repo — dort wird `.env` gefunden |
