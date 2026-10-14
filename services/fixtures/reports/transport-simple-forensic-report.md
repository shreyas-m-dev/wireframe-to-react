# Forensic fixture report: transport-simple

- Input: `simple_layout.png`
- Output: `services/fixtures/outputs/transport-simple/`
- Artifacts:
  - `services/fixtures/outputs/transport-simple/backend-preview-contract.json`
  - `services/fixtures/outputs/transport-simple/card-recovery.json`
  - `services/fixtures/outputs/transport-simple/card-recovery.png`
  - `services/fixtures/outputs/transport-simple/cgda-report.json`
  - `services/fixtures/outputs/transport-simple/detections-clean.png`
  - `services/fixtures/outputs/transport-simple/detections-debug.png`
  - `services/fixtures/outputs/transport-simple/detections-elements.json`
  - `services/fixtures/outputs/transport-simple/detections.json`
  - `services/fixtures/outputs/transport-simple/edge-map.png`
  - `services/fixtures/outputs/transport-simple/execution-log.json`
  - `services/fixtures/outputs/transport-simple/fidelity.json`
  - `services/fixtures/outputs/transport-simple/generated-after-cgda.jsx`
  - `services/fixtures/outputs/transport-simple/generated-before-cgda.jsx`
  - `services/fixtures/outputs/transport-simple/generated.jsx`
  - `services/fixtures/outputs/transport-simple/grayscale.png`
  - `services/fixtures/outputs/transport-simple/input-image.json`
  - `services/fixtures/outputs/transport-simple/layout-plan.json`
  - `services/fixtures/outputs/transport-simple/macro-zones.png`
  - `services/fixtures/outputs/transport-simple/normalized.png`
  - `services/fixtures/outputs/transport-simple/ocr-debug.png`
  - `services/fixtures/outputs/transport-simple/ocr-status.json`
  - `services/fixtures/outputs/transport-simple/ocr.json`
  - `services/fixtures/outputs/transport-simple/original-image.png`
  - `services/fixtures/outputs/transport-simple/preprocessing.json`
  - `services/fixtures/outputs/transport-simple/rag-query.json`
  - `services/fixtures/outputs/transport-simple/rag-results.json`
  - `services/fixtures/outputs/transport-simple/roi-recovery-debug.png`
  - `services/fixtures/outputs/transport-simple/roi-recovery.json`
  - `services/fixtures/outputs/transport-simple/schema-tree.txt`
  - `services/fixtures/outputs/transport-simple/schema.json`
  - `services/fixtures/outputs/transport-simple/threshold.png`
  - `services/fixtures/outputs/transport-simple/thumbnail-recovery.json`
  - `services/fixtures/outputs/transport-simple/thumbnail-recovery.png`
  - `services/fixtures/outputs/transport-simple/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **completed**
- OCR: {'enabled': True, 'words': 8, 'lines': 1, 'groups': 1}
- Macro regions: ['page', 'header', 'main', 'section']
- Elements by role/type: `{'page': 1, 'header': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'container': 1, 'nav-link': 4, 'nav-group': 1}`
- Hierarchy depth: 4
- RAG records: ['product-detail-gallery-page', 'product-gallery-section', 'header-logo-nav-buttons', 'product-detail-section']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 3, 'leafCount': 7, 'mediaCount': 1, 'buttonCount': 0, 'maxDepth': 4, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'pass'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
