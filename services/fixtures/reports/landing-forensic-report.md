# Forensic fixture report: landing

- Input: `landing_layout.png`
- Output: `services/fixtures/outputs/landing/`
- Artifacts:
  - `services/fixtures/outputs/landing/card-recovery.json`
  - `services/fixtures/outputs/landing/card-recovery.png`
  - `services/fixtures/outputs/landing/cgda-report.json`
  - `services/fixtures/outputs/landing/detections-clean.png`
  - `services/fixtures/outputs/landing/detections-debug.png`
  - `services/fixtures/outputs/landing/detections-elements.json`
  - `services/fixtures/outputs/landing/detections.json`
  - `services/fixtures/outputs/landing/edge-map.png`
  - `services/fixtures/outputs/landing/execution-log.json`
  - `services/fixtures/outputs/landing/fidelity.json`
  - `services/fixtures/outputs/landing/generated-after-cgda.jsx`
  - `services/fixtures/outputs/landing/generated-before-cgda.jsx`
  - `services/fixtures/outputs/landing/generated.jsx`
  - `services/fixtures/outputs/landing/grayscale.png`
  - `services/fixtures/outputs/landing/input-image.json`
  - `services/fixtures/outputs/landing/layout-plan.json`
  - `services/fixtures/outputs/landing/macro-zones.png`
  - `services/fixtures/outputs/landing/normalized.png`
  - `services/fixtures/outputs/landing/ocr-debug.png`
  - `services/fixtures/outputs/landing/ocr-status.json`
  - `services/fixtures/outputs/landing/ocr.json`
  - `services/fixtures/outputs/landing/original-image.png`
  - `services/fixtures/outputs/landing/preprocessing.json`
  - `services/fixtures/outputs/landing/rag-query.json`
  - `services/fixtures/outputs/landing/rag-results.json`
  - `services/fixtures/outputs/landing/roi-recovery-debug.png`
  - `services/fixtures/outputs/landing/roi-recovery.json`
  - `services/fixtures/outputs/landing/schema-tree.txt`
  - `services/fixtures/outputs/landing/schema.json`
  - `services/fixtures/outputs/landing/threshold.png`
  - `services/fixtures/outputs/landing/thumbnail-recovery.json`
  - `services/fixtures/outputs/landing/thumbnail-recovery.png`
  - `services/fixtures/outputs/landing/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **completed**
- OCR: {'enabled': True, 'words': 0, 'lines': 0, 'groups': 0}
- Macro regions: ['page', 'main', 'section']
- Elements by role/type: `{'page': 1, 'main': 1, 'media-region': 1, 'section': 1, 'container': 1, 'media': 1, 'repeated-region': 1, 'repeated-card-grid': 1, 'card': 3}`
- Hierarchy depth: 5
- RAG records: ['product-detail-gallery-page', 'card-grid', 'product-gallery-section', 'card-image-title-text']
- Fidelity (schema-layout gate): {'score': 0.75, 'fullPage': True, 'majorRegionCount': 2, 'leafCount': 6, 'mediaCount': 1, 'buttonCount': 0, 'maxDepth': 5, 'passed': True, 'reasons': ['too few macro regions']}
- Validation: {'valid': True, 'structuralAccuracy': 1}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
