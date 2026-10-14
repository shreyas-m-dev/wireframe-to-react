# Detection backend preparation

The active backend remains `classical_cv`: preprocessing, macro-zone density
heuristics, contours and optional Tesseract OCR. `backends.py` defines the
future seam: `ClassicalCVBackend`, `ModelBackedBackend`, and
`HybridOrchestrator`. No model is installed or selected by this preparation.

A future model-backed detector needs image files, pixel dimensions, page and
section boxes, element boxes/classes, parent-child hierarchy, page category,
OCR text where legal, and a test split. It should return normalized elements
compatible with `heuristic_detector.to_schema_input()`. Low-confidence model
results must remain structural regions/warnings; they must not become repeated
fallback controls. Confidence belongs in diagnostics, not the normal UI.
