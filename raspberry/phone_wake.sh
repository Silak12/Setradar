#!/bin/bash
# Weckt das Android-Phone auf (Bildschirm an)
# Crontab: 0 10 * * * /home/pi/Lineup-Berlin/raspberry/phone_wake.sh

ADB=$(which adb 2>/dev/null || echo "/usr/bin/adb")
DEVICE=$(python3 -c "import yaml; c=yaml.safe_load(open('$(dirname "$0")/config.yaml')); print(c.get('adb_device',''))" 2>/dev/null)

if [ -n "$DEVICE" ]; then
  ADB_CMD="$ADB -s $DEVICE"
else
  ADB_CMD="$ADB"
fi

echo "[$(date '+%H:%M:%S')] Phone aufwecken..."
$ADB_CMD shell input keyevent 224
# Kurz warten und nochmal falls es nicht reagiert hat
sleep 2
$ADB_CMD shell input keyevent 224
echo "[$(date '+%H:%M:%S')] Fertig."
