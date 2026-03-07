#!/bin/bash
# Legt das Android-Phone schlafen (Bildschirm aus)
# Crontab: 30 0 * * * /home/pi/Lineup-Berlin/raspberry/phone_sleep.sh

ADB=$(which adb 2>/dev/null || echo "/usr/bin/adb")
DEVICE=$(python3 -c "import yaml; c=yaml.safe_load(open('$(dirname "$0")/config.yaml')); print(c.get('adb_device',''))" 2>/dev/null)

if [ -n "$DEVICE" ]; then
  ADB_CMD="$ADB -s $DEVICE"
else
  ADB_CMD="$ADB"
fi

echo "[$(date '+%H:%M:%S')] Phone schlafen legen..."
$ADB_CMD shell input keyevent 223
echo "[$(date '+%H:%M:%S')] Fertig."
