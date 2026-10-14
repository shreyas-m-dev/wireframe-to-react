# Forensic fixture report: simple-layout-forensic

- Input: `simple_layout.png`
- Output: `services/fixtures/outputs/simple-layout-forensic/`
- Artifacts:
  - `services/fixtures/outputs/simple-layout-forensic/detections-clean.png`
  - `services/fixtures/outputs/simple-layout-forensic/detections-debug.png`
  - `services/fixtures/outputs/simple-layout-forensic/detections-elements.json`
  - `services/fixtures/outputs/simple-layout-forensic/detections.json`
  - `services/fixtures/outputs/simple-layout-forensic/edge-map.png`
  - `services/fixtures/outputs/simple-layout-forensic/execution-log.json`
  - `services/fixtures/outputs/simple-layout-forensic/fidelity.json`
  - `services/fixtures/outputs/simple-layout-forensic/generated.jsx`
  - `services/fixtures/outputs/simple-layout-forensic/grayscale.png`
  - `services/fixtures/outputs/simple-layout-forensic/input-image.json`
  - `services/fixtures/outputs/simple-layout-forensic/layout-plan.json`
  - `services/fixtures/outputs/simple-layout-forensic/macro-zones.png`
  - `services/fixtures/outputs/simple-layout-forensic/normalized.png`
  - `services/fixtures/outputs/simple-layout-forensic/original-image.png`
  - `services/fixtures/outputs/simple-layout-forensic/preprocessing.json`
  - `services/fixtures/outputs/simple-layout-forensic/rag-query.json`
  - `services/fixtures/outputs/simple-layout-forensic/rag-results.json`
  - `services/fixtures/outputs/simple-layout-forensic/schema-tree.txt`
  - `services/fixtures/outputs/simple-layout-forensic/schema.json`
  - `services/fixtures/outputs/simple-layout-forensic/threshold.png`
  - `services/fixtures/outputs/simple-layout-forensic/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- Macro regions: ['page', 'header', 'main', 'gallery', 'product-detail', 'media']
- Elements by role/type: `{'page': 1, 'header': 1, 'button': 3, 'main': 1, 'gallery': 1, 'product-detail': 1, 'media': 1, 'container': 1}`
- Hierarchy depth: 4
- RAG records: ['product-detail-gallery-page', 'product-gallery-section', 'product-detail-section', 'header-logo-nav-buttons']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 5, 'leafCount': 6, 'mediaCount': 2, 'buttonCount': 3, 'maxDepth': 4, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 0.5}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
