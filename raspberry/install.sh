#!/usr/bin/env bash
# Setradar — Raspberry Pi Installer
# -----------------------------------------------------------------------------
# Setup:
#   git clone https://github.com/Silak12/Setradar.git /home/pi/Setradar
#   cd /home/pi/Setradar
#   bash raspberry/install.sh
#
# Update später:
#   cd /home/pi/Setradar && bash raspberry/install.sh
# -----------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RASPI_DIR="$REPO_DIR/raspberry"
VENV_DIR="$REPO_DIR/.venv"
ENV_FILE="$REPO_DIR/.env"

log() { printf "\033[1;32m[install]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
die() { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; exit 1; }

log "Repo: $REPO_DIR"

# ── 1. System-Pakete ─────────────────────────────────────────────────────────
if command -v apt-get >/dev/null 2>&1; then
  log "Installiere System-Pakete (python3-venv, git, adb)…"
  sudo apt-get update -qq
  sudo apt-get install -y python3-venv python3-pip git android-tools-adb
else
  warn "kein apt-get gefunden — System-Pakete überspringen"
fi

# ── 2. Repo aktualisieren (falls bereits geklont) ───────────────────────────
if [ -d "$REPO_DIR/.git" ]; then
  log "git pull…"
  git -C "$REPO_DIR" pull --ff-only
fi

# ── 3. Virtualenv ────────────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  log "erstelle venv in $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
log "pip upgrade + install (dauert beim ersten Mal ein paar Minuten)…"
pip install --quiet --upgrade pip
pip install --quiet -e "$REPO_DIR"

# ── 4. Ordner ────────────────────────────────────────────────────────────────
mkdir -p "$RASPI_DIR/captured_stories" "$RASPI_DIR/logs"

# ── 5. .env ──────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  log "erstelle .env aus Template"
  cp "$REPO_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  warn ".env angelegt — bitte jetzt Keys eintragen: nano $ENV_FILE"
fi

# ── 6. Drive Service Account Reminder ────────────────────────────────────────
if [ ! -f "$REPO_DIR/service_account.json" ]; then
  warn "service_account.json fehlt — für Drive-Upload nach $REPO_DIR kopieren"
fi

# ── 7. ADB-Check ─────────────────────────────────────────────────────────────
if command -v adb >/dev/null 2>&1; then
  log "adb devices:"
  adb devices || true
else
  warn "adb nicht installiert — der Story-Bot braucht adb + verbundenes Phone"
fi

cat <<EOF

$(log "fertig ✓")

Nächste Schritte:
  1. .env prüfen:        nano $ENV_FILE
  2. Cronjobs einbauen:  crontab -e   (siehe $RASPI_DIR/CRONJOBS.md)
  3. Manuell testen:     $VENV_DIR/bin/python $RASPI_DIR/main.py

EOF
