import cv2
import numpy as np
import logging

log = logging.getLogger(__name__)

# Nur der obere Ring-Bogen der Story-Avatare (Samsung A15, 1080x2340px).
# Schmalerer Crop = kein Profilfoto-Inhalt im Scan → weniger False Positives.
STORY_BAR_Y1 = 237
STORY_BAR_Y2 = 268

# Für Avatar-Klick: Mittelpunkt der Avatare
STORY_BAR_CENTER_Y = 305

# Follow-Button Erkennung (unteres Drittel der Avatar-Zone)
# #181c1f = BGR(31,28,24) – leicht heller als Hintergrund #0f141a = BGR(26,20,15)
FOLLOW_Y1      = 485
FOLLOW_Y2      = 503
FOLLOW_LOW     = np.array([26, 22, 18])
FOLLOW_HIGH    = np.array([40, 36, 32])
FOLLOW_MIN_PX  = 400   # Follow-Button ist ein Pill → viele Pixel


def _gradient_masks(hsv):
    """Gibt die vier Instagram-Gradient Farb-Masken zurück."""
    rot_a  = cv2.inRange(hsv, np.array([0,   120, 120]), np.array([10,  255, 255]))
    rot_b  = cv2.inRange(hsv, np.array([160, 120, 120]), np.array([180, 255, 255]))
    orange = cv2.inRange(hsv, np.array([10,  120, 120]), np.array([35,  255, 255]))
    lila   = cv2.inRange(hsv, np.array([130,  60, 120]), np.array([160, 255, 255]))
    return rot_a, rot_b, orange, lila


class StoryVision:

    def screenshot_to_numpy(self, device):
        return device.screenshot(format="opencv")

    def has_unseen_stories(self, img):
        """
        Erkennt Instagram Story-Ringe im oberen Ring-Bogen.

        Anti-False-Positive: Es müssen mindestens ZWEI verschiedene
        Farbzonen des Gradienten vorhanden sein (z.B. Orange + Lila).
        Ein rotes Profilfoto triggert nur Rot-A/B, nicht Orange oder Lila.
        """
        if img is None:
            return False

        bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)
        rot_a, rot_b, orange, lila = _gradient_masks(hsv)

        counts = {
            "rot":    cv2.countNonZero(cv2.bitwise_or(rot_a, rot_b)),
            "orange": cv2.countNonZero(orange),
            "lila":   cv2.countNonZero(lila),
        }
        log.debug(f"Story-Bar Pixel: {counts}")

        # Mindestens 2 Zonen mit je >80 Pixeln → echter Instagram-Gradient
        total_pixels = (STORY_BAR_Y2 - STORY_BAR_Y1) * img.shape[1]
        # Eine Zone >90% der Fläche = kein echter Gradient (z.B. falscher Screen)
        if any(v > total_pixels * 0.9 for v in counts.values()):
            log.debug("Eine Zone dominiert gesamte Fläche – kein Instagram-Screen")
            return False

        zones_active = sum(1 for v in counts.values() if v > 80)
        return zones_active >= 2

    def count_story_avatars(self, img):
        """
        Zählt Story-Avatare und klassifiziert jeden als 'followed' oder 'suggested'.
        Gibt (followed, suggested, total) zurück.

        suggested = Follow-Button (#181c1f) in der Zone unter dem Avatar erkannt.
        """
        if img is None:
            return 0, 0, 0

        h, w = img.shape[:2]

        # Avatar-Positionen aus Gradient-Mask
        bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)
        rot_a  = cv2.inRange(hsv, np.array([0,   120, 120]), np.array([10,  255, 255]))
        rot_b  = cv2.inRange(hsv, np.array([160, 120, 120]), np.array([180, 255, 255]))
        orange = cv2.inRange(hsv, np.array([10,  120, 120]), np.array([35,  255, 255]))
        lila   = cv2.inRange(hsv, np.array([130,  60, 120]), np.array([160, 255, 255]))
        mask   = cv2.bitwise_or(
            cv2.bitwise_or(rot_a, rot_b),
            cv2.bitwise_or(orange, lila)
        )

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 0, 0, 0

        # X-Mittelpunkte sammeln und nahe zusammenführen
        xs = sorted(
            int(cv2.moments(c)["m10"] / cv2.moments(c)["m00"])
            for c in contours if cv2.moments(c)["m00"] > 0
        )
        centers = []
        for x in xs:
            if centers and abs(x - centers[-1]) < 30:
                centers[-1] = (centers[-1] + x) // 2
            else:
                centers.append(x)

        # Follow-Button pro Avatar prüfen
        fy1 = max(0, int(FOLLOW_Y1 * h / 2340))
        fy2 = min(h, int(FOLLOW_Y2 * h / 2340))
        followed = suggested = 0

        for cx in centers:
            fx1 = max(0, cx - 55)
            fx2 = min(w, cx + 55)
            region = img[fy1:fy2, fx1:fx2]
            if region.size == 0:
                continue
            px = cv2.countNonZero(cv2.inRange(region, FOLLOW_LOW, FOLLOW_HIGH))
            if px >= FOLLOW_MIN_PX:
                suggested += 1
                log.debug(f"Avatar cx={cx}: SUGGESTED (px={px})")
            else:
                followed += 1
                log.debug(f"Avatar cx={cx}: followed  (px={px})")

        log.info(f"Avatare: {len(centers)} gesamt – {followed} followed, {suggested} suggested")
        return followed, suggested, len(centers)

    def find_first_story_avatar(self, img):
        """
        Sucht den linkesten Story-Avatar anhand des Gradient-Rings.
        Gibt relative (x, y) Koordinaten des Avatar-Mittelpunkts zurück.
        """
        if img is None:
            return None

        h, w = img.shape[:2]
        bar = img[STORY_BAR_Y1:STORY_BAR_Y2, :]
        hsv = cv2.cvtColor(bar, cv2.COLOR_BGR2HSV)
        rot_a, rot_b, orange, lila = _gradient_masks(hsv)

        mask = cv2.bitwise_or(
            cv2.bitwise_or(rot_a, rot_b),
            cv2.bitwise_or(orange, lila)
        )

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

        # X aus Ring-Bogen, Y auf Avatar-Mitte setzen (nicht Ring-Bogen-Mitte)
        cx = int(M["m10"] / M["m00"])
        rel_x = cx / w
        rel_y = STORY_BAR_CENTER_Y / h

        log.debug(f"Erster Avatar bei: ({rel_x:.2f}, {rel_y:.2f})")
        return (rel_x, rel_y)
