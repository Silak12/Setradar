# Einmalig ausführen zum debuggen
import uiautomator2 as u2
import cv2
import numpy as np

d = u2.connect()
d.app_start("com.instagram.android")

import time
time.sleep(4)

# Home-Tab
d(description="Home").click()
time.sleep(2)

# Screenshot speichern
d.screenshot("debug_home.png")
print("Screenshot gespeichert!")

# Obere 130px analysieren
img = cv2.imread("debug_home.png")
bar = img[0:130, :]
cv2.imwrite("debug_storybar.png", bar)

# HSV-Werte der Story-Leiste ausgeben
hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)
print("HSV Durchschnitt Story-Leiste:", hsv.mean(axis=(0,1)))