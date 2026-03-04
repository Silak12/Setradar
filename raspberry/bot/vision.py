import cv2
import numpy as np
import logging

log = logging.getLogger(__name__)


class StoryVision:
    """Erkennt ob Story-Ringe rot (ungesehen) oder grau (gesehen) sind."""

    def screenshot_to_numpy(self, device):
        """Screenshot direkt als numpy-Array."""
        img = device.screenshot(format="opencv")
        return img

    def has_unseen_stories(self, img):
        """
        True  → Es gibt noch rote (ungesehene) Story-Ringe
        False → Alle Ringe sind grau
        """
        if img is None:
            return False

        # Story-Leiste = obere ~130px
        h, w = img.shape[:2]
        bar = img[50:130, :]

        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

        # Rot hat zwei HSV-Bereiche (0-10 und 160-180)
        mask1 = cv2.inRange(hsv, np.array([0, 100, 100]),
                                  np.array([10, 255, 255]))
        mask2 = cv2.inRange(hsv, np.array([160, 100, 100]),
                                  np.array([180, 255, 255]))

        # Instagram Story-Gradient: auch Orange/Pink
        mask3 = cv2.inRange(hsv, np.array([10, 100, 100]),
                                  np.array([35, 255, 255]))

        combined = cv2.bitwise_or(mask1, mask2)
        combined = cv2.bitwise_or(combined, mask3)

        red_pixels = cv2.countNonZero(combined)
        log.debug(f"Rote Pixel in Story-Bar: {red_pixels}")

        return red_pixels > 300

    def find_first_story_avatar(self, img):
        """
        Gibt (x, y) des ersten roten Story-Rings zurück,
        oder None wenn kein ungesehener Ring gefunden.
        """
        if img is None:
            return None

        h, w = img.shape[:2]
        bar = img[50:130, :]
        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

        mask1 = cv2.inRange(hsv, np.array([0, 100, 100]),
                                  np.array([10, 255, 255]))
        mask2 = cv2.inRange(hsv, np.array([160, 100, 100]),
                                  np.array([180, 255, 255]))
        mask3 = cv2.inRange(hsv, np.array([10, 100, 100]),
                                  np.array([35, 255, 255]))
        mask = cv2.bitwise_or(cv2.bitwise_or(mask1, mask2), mask3)

        # Konturen der roten Bereiche
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return None

        # Größte Kontur = erster Avatar
        largest = max(contours, key=cv2.contourArea)
        M = cv2.moments(largest)
        if M["m00"] == 0:
            return None

        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"]) + 50  # offset wegen Crop

        # In relative Koordinaten (0.0 - 1.0)
        return (cx / w, cy / h)