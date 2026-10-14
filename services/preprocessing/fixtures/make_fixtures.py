"""
Generates a handful of synthetic wireframe-like images so preprocess.py can
be exercised standalone, per build order step 1 ("test it standalone on a
handful of sample images before touching YOLO"). Swap these for real
wireframe screenshots/exports as soon as you have some.
"""

from pathlib import Path

import cv2
import numpy as np

OUT_DIR = Path(__file__).parent


def wireframe_simple() -> np.ndarray:
    """A basic layout: header bar, two buttons, one text block."""
    img = np.full((800, 1200, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (0, 0), (1200, 80), (230, 230, 230), -1)          # header
    cv2.putText(img, "LOGO", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.rectangle(img, (900, 20), (1020, 60), (0, 0, 0), 2)              # button 1
    cv2.putText(img, "Login", (925, 47), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
    cv2.rectangle(img, (1040, 20), (1170, 60), (0, 0, 0), 2)             # button 2
    cv2.putText(img, "Sign Up", (1055, 47), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
    cv2.rectangle(img, (50, 150), (1150, 400), (200, 200, 200), 2)       # text block border
    for i, y in enumerate(range(180, 380, 30)):
        cv2.line(img, (80, y), (1100, y), (180, 180, 180), 2)
    return img


def wireframe_corrupt_bytes() -> bytes:
    """Not a real image at all — used to test rejection."""
    return b"this is definitely not an image file, just some text bytes 12345"


def wireframe_tiny() -> np.ndarray:
    """Below MIN_DIMENSION — used to test rejection."""
    return np.full((10, 10, 3), 255, dtype=np.uint8)

def wireframe_dashboard() -> np.ndarray:
    img=np.full((800,1200,3),255,dtype=np.uint8); cv2.rectangle(img,(0,0),(1200,70),(220,220,220),-1); cv2.rectangle(img,(0,70),(230,800),(240,240,240),-1)
    for x in (270,570,870): cv2.rectangle(img,(x,110),(x+250,260),(0,0,0),2)
    cv2.rectangle(img,(270,300),(1140,700),(0,0,0),2); return img

def wireframe_landing() -> np.ndarray:
    img=np.full((800,1200,3),255,dtype=np.uint8); cv2.rectangle(img,(0,0),(1200,70),(220,220,220),-1); cv2.rectangle(img,(60,120),(1140,390),(0,0,0),2); cv2.rectangle(img,(80,440),(360,680),(0,0,0),2); cv2.rectangle(img,(460,440),(740,680),(0,0,0),2); cv2.rectangle(img,(840,440),(1120,680),(0,0,0),2); return img


def main():
    cv2.imwrite(str(OUT_DIR / "simple_layout.png"), wireframe_simple())
    cv2.imwrite(str(OUT_DIR / "tiny.png"), wireframe_tiny())
    cv2.imwrite(str(OUT_DIR / "dashboard_layout.png"), wireframe_dashboard())
    cv2.imwrite(str(OUT_DIR / "landing_layout.png"), wireframe_landing())
    (OUT_DIR / "corrupt.png").write_bytes(wireframe_corrupt_bytes())
    (OUT_DIR / "not_an_image.txt").write_text("hello, not an image")
    print("Fixtures written to", OUT_DIR)


if __name__ == "__main__":
    main()
