"""
Preprocessing module — Step 1 of the wireframe-to-React pipeline.

Pipeline: validate input -> resize -> grayscale -> blur -> normalize -> pixel matrix

Pure functions, no web framework dependency, so this can be unit tested
standalone before the YOLOv8 module (step 2) exists. A thin FastAPI/Flask
sidecar can wrap `run_pipeline()` later — see services/preprocessing/README.md.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

VALID_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
VALID_MIME_PREFIXES = {"image/png", "image/jpeg", "image/webp", "image/bmp"}

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MIN_DIMENSION = 32          # reject images smaller than this on either axis
MAX_DIMENSION = 8000        # reject absurdly large images (decompression-bomb guard)

# Maximum canvas, not a forced shape. Forcing every source into a square was
# collapsing tall landing pages and invalidating their vertical hierarchy.
TARGET_SIZE = (1024, 1536)  # (maximum width, maximum height)
BLUR_KERNEL = (3, 3)        # light denoise blur; small so UI edges survive
GAUSSIAN_SIGMA = 0


class InvalidInputError(ValueError):
    """Raised when an uploaded file fails validation and must be rejected."""


@dataclass
class PreprocessResult:
    pixel_matrix: np.ndarray             # float32, normalized [0,1], shape (H, W)
    original_shape: tuple[int, int]      # (H, W) before resize
    resized_shape: tuple[int, int]       # (H, W) after resize, == TARGET_SIZE reversed
    scale_factor: tuple[float, float] = field(default=(1.0, 1.0))  # (x_scale, y_scale) applied
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Step: validate
# ---------------------------------------------------------------------------

def validate_input(data: bytes, filename: str) -> None:
    """
    Reject invalid input up front, per the pipeline spec. Raises
    InvalidInputError with a human-readable reason; caller should turn
    that into a 4xx response at the API boundary.
    """
    if not data:
        raise InvalidInputError("Empty file.")

    if len(data) > MAX_FILE_SIZE_BYTES:
        raise InvalidInputError(
            f"File too large ({len(data)} bytes); max is {MAX_FILE_SIZE_BYTES} bytes."
        )

    ext = Path(filename).suffix.lower()
    # Only hard-reject on a *present but wrong* extension (e.g. a .txt file
    # renamed to look image-like) — a MISSING extension is not itself
    # disqualifying, since the authoritative check is the decode below
    # (does OpenCV actually recognize these bytes as an image). This
    # matters in practice: multer's default disk storage writes temp files
    # with no extension at all, and this function needs to accept those
    # when the underlying bytes are genuinely a valid image — see
    # backend/server.js's storage config comment for the full story.
    if ext and ext not in VALID_EXTENSIONS:
        raise InvalidInputError(
            f"Unsupported file extension '{ext}'. Allowed: {sorted(VALID_EXTENSIONS)}"
        )

    # Decode to confirm it's actually a valid, non-corrupt image (not just a
    # file with an image-looking extension).
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise InvalidInputError("File could not be decoded as an image (corrupt or unsupported format).")

    if img.ndim < 2:
        raise InvalidInputError("Decoded image has invalid dimensionality.")

    h, w = img.shape[:2]
    if h < MIN_DIMENSION or w < MIN_DIMENSION:
        raise InvalidInputError(f"Image too small ({w}x{h}); minimum is {MIN_DIMENSION}px per side.")
    if h > MAX_DIMENSION or w > MAX_DIMENSION:
        raise InvalidInputError(f"Image too large ({w}x{h}); maximum is {MAX_DIMENSION}px per side.")


# ---------------------------------------------------------------------------
# Step: resize / grayscale / blur / normalize
# ---------------------------------------------------------------------------

def resize(img: np.ndarray, target_size: tuple[int, int] = TARGET_SIZE) -> tuple[np.ndarray, tuple[float, float]]:
    """Downscale into a maximum canvas while preserving source geometry.

    The detector sees the entire original composition; coordinate scales stay
    equal on both axes, avoiding the false sections caused by anisotropic
    square stretching.
    """
    h, w = img.shape[:2]
    target_w, target_h = target_size
    scale = min(target_w / w, target_h / h, 1.0)
    resized_w, resized_h = max(1, round(w * scale)), max(1, round(h * scale))
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    resized = cv2.resize(img, (resized_w, resized_h), interpolation=interpolation)
    x_scale = resized_w / w
    y_scale = resized_h / h
    return resized, (x_scale, y_scale)


def to_grayscale(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img  # already single-channel
    channels = img.shape[2]
    if channels == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def denoise_blur(img: np.ndarray, kernel: tuple[int, int] = BLUR_KERNEL) -> np.ndarray:
    """Light Gaussian blur to suppress scan/photo noise without destroying
    thin UI borders. Kernel is intentionally small (3x3)."""
    return cv2.GaussianBlur(img, kernel, GAUSSIAN_SIGMA)


def normalize(img: np.ndarray) -> np.ndarray:
    """Scale pixel values to float32 [0, 1]."""
    return img.astype(np.float32) / 255.0


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def run_pipeline(data: bytes, filename: str, target_size: tuple[int, int] = TARGET_SIZE) -> PreprocessResult:
    """
    validate -> resize -> grayscale -> blur -> normalize -> pixel matrix

    Raises InvalidInputError if the input fails validation (caller should
    turn this into an HTTP 4xx at the API boundary, per the pipeline's
    'reject if invalid' step).
    """
    validate_input(data, filename)

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    original_shape = img.shape[:2]  # (H, W)

    warnings: list[str] = []
    aspect = original_shape[1] / original_shape[0]
    resized_img, scale_factor = resize(img, target_size)
    gray = to_grayscale(resized_img)
    blurred = denoise_blur(gray)
    normalized = normalize(blurred)

    return PreprocessResult(
        pixel_matrix=normalized,
        original_shape=original_shape,
        resized_shape=normalized.shape[:2],
        scale_factor=scale_factor,
        warnings=warnings,
    )


def load_and_run(path: str | Path, target_size: tuple[int, int] = TARGET_SIZE) -> PreprocessResult:
    """Convenience wrapper for CLI/test use: read a file off disk and run the pipeline."""
    path = Path(path)
    data = path.read_bytes()
    return run_pipeline(data, path.name, target_size)
