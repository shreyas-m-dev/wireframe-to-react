"""Regression assertions over the actual ecommerce forensic artifacts."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "services" / "fixtures" / "outputs" / "ecommerce"


def walk(node):
    yield node
    for child in node.get("children", []):
        yield from walk(child)


def main():
    status = json.loads((OUT / "ocr-status.json").read_text())
    assert (OUT / "ocr-status.json").exists()
    if status["enabled"]:
        assert (OUT / "ocr.json").exists() and (OUT / "ocr-debug.png").exists()
        document = json.loads((OUT / "ocr.json").read_text())
        assert document["words"] and document["lines"] and document["groups"]
    detections = json.loads((OUT / "detections.json").read_text())["elements"]
    labels = {(item.get("label") or "").lower(): item for item in detections}
    assert labels["product title"]["type"] != "button"
    assert labels["$123.00"]["type"] != "button"
    assert any(item.get("role") == "description" and item["type"] != "button" for item in detections)
    schema = json.loads((OUT / "schema.json").read_text())
    roles = {node.get("role") for node in walk(schema)}
    assert {"heading", "price", "description"} <= roles
    print("PASS: ecommerce OCR artifacts and text classification evidence")


if __name__ == "__main__":
    main()
