"""Shared, graceful Tesseract discovery for every OCR call path."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytesseract

WINDOWS_CANDIDATES = (
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
)


def resolve_tesseract() -> dict:
    configured = os.environ.get("TESSERACT_CMD", "").strip()
    candidates = [Path(configured)] if configured else []
    candidates.extend(WINDOWS_CANDIDATES)
    path_lookup = shutil.which("tesseract")
    if path_lookup:
        candidates.append(Path(path_lookup))
    for candidate in candidates:
        if candidate.is_file():
            try:
                pytesseract.pytesseract.tesseract_cmd = str(candidate)
                version = str(pytesseract.get_tesseract_version()).splitlines()[0]
                return {"enabled": True, "executablePath": str(candidate), "version": version, "reason": None}
            except Exception as exc:
                return {"enabled": False, "executablePath": str(candidate), "version": None, "reason": f"Tesseract version check failed: {exc}"}
    reason = "TESSERACT_CMD is not set and no Tesseract executable was found in standard Windows locations or PATH."
    return {"enabled": False, "executablePath": None, "version": None, "reason": reason}


def configure_tesseract() -> dict:
    """Resolve and configure pytesseract; never raise for an unavailable engine."""
    return resolve_tesseract()
