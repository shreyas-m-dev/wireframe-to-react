"""
Detection module — Pipeline Step 2.

Wraps YOLOv8 (Ultralytics) inference behind a small Flask sidecar the Node
Express backend calls over HTTP. Per the build order: get a pretrained
model running end-to-end on a dummy class set first, THEN fine-tune on real
UI-element classes once the schema/RAG/codegen steps can consume its output.

Requires (not installed in this sandbox — no network here):
    pip install ultralytics flask opencv-python-headless

Dummy class set (stage 1, matches build order step 2):
    0: box    -> maps to schema type "container"
    1: text   -> maps to schema type "text"

Real UI class set (stage 2, once you fine-tune):
    button, input, text, image, checkbox, radio, dropdown, container, icon, link

Swap MODEL_PATH + CLASS_MAP below when you move from stage 1 to stage 2 —
nothing else in the pipeline needs to change, since downstream consumes the
normalized `Detection` objects, not raw YOLO output.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

# NOTE: these imports require `pip install ultralytics flask` which could not
# be run in this offline sandbox. The logic below (NMS post-filter, class
# mapping, confidence thresholding) is written to be testable independent of
# the actual model call — see tests/test_detect.py, which exercises
# `postprocess_results()` with a fake/mocked model output.
try:
    from ultralytics import YOLO
except ImportError:  # pragma: no cover - only true in this sandbox
    YOLO = None

CONFIDENCE_THRESHOLD = 0.35
IOU_THRESHOLD = 0.45  # used for NMS inside YOLOv8 itself, passed at inference time

# Stage 1 (dummy) class map — see docstring above
CLASS_MAP_STAGE1 = {0: "container", 1: "text"}

# Stage 2 (fine-tuned) class map — update once real training completes
CLASS_MAP_STAGE2 = {
    0: "button",
    1: "input",
    2: "text",
    3: "image",
    4: "checkbox",
    5: "radio",
    6: "dropdown",
    7: "container",
    8: "icon",
    9: "link",
}


@dataclass
class Detection:
    label: str          # mapped class name, e.g. "button"
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    def to_dict(self) -> dict:
        return asdict(self)


class Detector:
    """Thin wrapper around a loaded YOLOv8 model."""

    def __init__(self, model_path: str, class_map: dict[int, str] = CLASS_MAP_STAGE1):
        if YOLO is None:
            raise RuntimeError(
                "ultralytics is not installed. Run: pip install ultralytics"
            )
        self.model = YOLO(model_path)
        self.class_map = class_map

    def detect(
        self,
        image_path_or_array,
        conf: float = CONFIDENCE_THRESHOLD,
        iou: float = IOU_THRESHOLD,
    ) -> list[Detection]:
        results = self.model.predict(
            source=image_path_or_array, conf=conf, iou=iou, verbose=False
        )
        return postprocess_results(results, self.class_map)


def postprocess_results(results, class_map: dict[int, str]) -> list[Detection]:
    """
    Convert raw Ultralytics `Results` objects into our normalized Detection
    list. Split out from `Detector.detect` so it's unit-testable with a
    fake/mock `results` object that mimics the Ultralytics API shape,
    without needing the actual model or GPU.
    """
    detections: list[Detection] = []
    for r in results:
        boxes = r.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            label = class_map.get(cls_id, f"unknown_{cls_id}")
            conf = float(box.conf[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            detections.append(Detection(label, conf, x1, y1, x2, y2))
    return detections


def to_schema_input(detections: list[Detection]) -> list[dict]:
    """Format detections for the schema builder (step 3), which expects
    plain dicts with x/y/w/h + type."""
    return [
        {
            "type": d.label,
            "confidence": d.confidence,
            "x": d.x1,
            "y": d.y1,
            "width": d.width,
            "height": d.height,
        }
        for d in detections
    ]
