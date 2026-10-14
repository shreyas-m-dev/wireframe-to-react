"""Executable resolver, disabled fallback, and ecommerce OCR smoke checks."""
from __future__ import annotations
import os
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "detection"))
sys.path.insert(0, str(ROOT / "scripts"))

from ocr import resolve_tesseract
from ocr_extractor import extract_ocr_document


def test_disabled_is_safe():
    with patch.dict(os.environ, {"TESSERACT_CMD": r"Z:\missing\tesseract.exe"}, clear=False), patch("ocr.WINDOWS_CANDIDATES", ()), patch("ocr.shutil.which", return_value=None):
        status = resolve_tesseract()
    assert status["enabled"] is False and status["reason"]


def test_resolver_and_ecommerce_smoke():
    status = resolve_tesseract()
    if not status["enabled"]:
        print(f"SKIP OCR smoke: {status['reason']}")
        return
    import cv2
    image = cv2.imread(str(ROOT / "services" / "fixtures" / "uploads" / "ecommerce-wireframe.png"))
    document = extract_ocr_document(image)
    assert document["status"]["enabled"]
    assert document["words"], "Expected at least one OCR word from ecommerce fixture"
    from cli_pipeline import cmd_detect
    elements = cmd_detect(str(ROOT / "services" / "fixtures" / "uploads" / "ecommerce-wireframe.png"))["elements"]
    assert any(item.get("role") == "price" and item["type"] != "button" for item in elements)
    assert any(item.get("role") == "description" and item["type"] != "button" for item in elements)
    assert any(item.get("role") in {"heading", "product-title"} and "product title" in (item.get("label") or "").lower() and item["type"] != "button" for item in elements)
    print(f"OCR {status['version']} words={len(document['words'])} lines={len(document['lines'])} groups={len(document['groups'])}")


if __name__ == "__main__":
    test_disabled_is_safe(); test_resolver_and_ecommerce_smoke(); print("PASS: OCR runtime")
