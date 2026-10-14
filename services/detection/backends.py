"""Detection backend contracts; model-backed implementation is intentionally deferred."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol
import numpy as np

@dataclass
class DetectionResult:
    elements: list[dict]
    diagnostics: dict = field(default_factory=dict)

class DetectionBackend(Protocol):
    name: str
    def detect(self, image: np.ndarray) -> DetectionResult: ...

class ClassicalCVBackend:
    name="classical_cv"
    def detect(self,image):
        from heuristic_detector import detect_from_array,to_schema_input
        return DetectionResult(to_schema_input(detect_from_array(image)),{"strategy":self.name})

class ModelBackedBackend:
    name="model_backed"
    def detect(self,image):
        raise RuntimeError("No trained layout model is configured. Supply weights, class map, and model adapter before enabling model_backed.")

class HybridOrchestrator:
    """Macro/region -> CV elements -> OCR -> hierarchy is orchestrated by CLI today.
    This object reserves a stable backend seam without changing active behavior."""
    def __init__(self, visual: DetectionBackend, ocr_enabled: bool=True): self.visual,self.ocr_enabled=visual,ocr_enabled
    def detect(self,image): return self.visual.detect(image)
