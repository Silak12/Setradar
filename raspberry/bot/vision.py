import cv2
import numpy as np
import logging

log = logging.getLogger(__name__)

# Story-Leiste Y-Koordinaten (angepasst auf Samsung A15)
STORY_BAR_Y1 = 155
STORY_BAR_Y2 = 390


class StoryVision:

    def screenshot_to_numpy(self, device):
        img = device.screenshot(format="opencv")
        return img

    def has_unseen_stories(self, img):
        if img is None:
            return False

        bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

        # Rot (zwei HSV-Bereiche)
        mask1 = cv2.inRange(hsv, np.array([0, 100, 100]),
                                  np.array([10, 255, 255]))
        mask2 = cv2.inRange(hsv, np.array([160, 100, 100]),
                                  np.array([180, 255, 255]))
        # Instagram Gradient: Orange/Pink/Lila (OpenCV HSV: H 0-179)
        mask3 = cv2.inRange(hsv, np.array([10,  100, 100]),
                                  np.array([35,  255, 255]))
        mask4 = cv2.inRange(hsv, np.array([130,  50, 100]),
                                  np.array([160, 255, 255]))

        combined = cv2.bitwise_or(mask1, mask2)
        combined = cv2.bitwise_or(combined, mask3)
        combined = cv2.bitwise_or(combined, mask4)

        red_pixels = cv2.countNonZero(combined)
        log.debug(f"Gradient-Pixel in Story-Bar: {red_pixels}")

        return red_pixels > 300

    def find_first_story_avatar(self, img):
        if img is None:
            return None

        h, w = img.shape[:2]
        bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)

        mask1 = cv2.inRange(hsv, np.array([0, 100, 100]),
                                  np.array([10, 255, 255]))
        mask2 = cv2.inRange(hsv, np.array([160, 100, 100]),
                                  np.array([180, 255, 255]))
        mask3 = cv2.inRange(hsv, np.array([10,  100, 100]),
                                  np.array([35,  255, 255]))
        mask4 = cv2.inRange(hsv, np.array([130,  50, 100]),
                                  np.array([160, 255, 255]))

        mask = cv2.bitwise_or(cv2.bitwise_or(mask1, mask2),
                              cv2.bitwise_or(mask3, mask4))

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            log.debug("Keine Story-Avatare gefunden")
            return None

        # Linksten Avatar nehmen (erster in der Leiste)
        leftmost = min(contours, key=lambda c: cv2.boundingRect(c)[0])
        M = cv2.moments(leftmost)
        if M["m00"] == 0:
            return None

        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"]) + STORY_BAR_Y1  # offset zurückrechnen

        # Relative Koordinaten (0.0 - 1.0)
        rel_x = cx / w
        rel_y = cy / h
        log.debug(f"Erster Avatar bei: ({rel_x:.2f}, {rel_y:.2f})")

        return (rel_x, rel_y)