# Forensic fixture report: login-form

- Input: `login_form.png`
- Output: `services/fixtures/outputs/login-form/`
- Artifacts:
  - `services/fixtures/outputs/login-form/card-recovery.json`
  - `services/fixtures/outputs/login-form/card-recovery.png`
  - `services/fixtures/outputs/login-form/cgda-report.json`
  - `services/fixtures/outputs/login-form/detections-clean.png`
  - `services/fixtures/outputs/login-form/detections-debug.png`
  - `services/fixtures/outputs/login-form/detections-elements.json`
  - `services/fixtures/outputs/login-form/detections.json`
  - `services/fixtures/outputs/login-form/edge-map.png`
  - `services/fixtures/outputs/login-form/execution-log.json`
  - `services/fixtures/outputs/login-form/fidelity.json`
  - `services/fixtures/outputs/login-form/generated-after-cgda.jsx`
  - `services/fixtures/outputs/login-form/generated-before-cgda.jsx`
  - `services/fixtures/outputs/login-form/generated.jsx`
  - `services/fixtures/outputs/login-form/grayscale.png`
  - `services/fixtures/outputs/login-form/input-image.json`
  - `services/fixtures/outputs/login-form/layout-plan.json`
  - `services/fixtures/outputs/login-form/macro-zones.png`
  - `services/fixtures/outputs/login-form/normalized.png`
  - `services/fixtures/outputs/login-form/ocr-debug.png`
  - `services/fixtures/outputs/login-form/ocr-status.json`
  - `services/fixtures/outputs/login-form/ocr.json`
  - `services/fixtures/outputs/login-form/original-image.png`
  - `services/fixtures/outputs/login-form/preprocessing.json`
  - `services/fixtures/outputs/login-form/rag-query.json`
  - `services/fixtures/outputs/login-form/rag-results.json`
  - `services/fixtures/outputs/login-form/roi-recovery-debug.png`
  - `services/fixtures/outputs/login-form/roi-recovery.json`
  - `services/fixtures/outputs/login-form/schema-tree.txt`
  - `services/fixtures/outputs/login-form/schema.json`
  - `services/fixtures/outputs/login-form/threshold.png`
  - `services/fixtures/outputs/login-form/thumbnail-recovery.json`
  - `services/fixtures/outputs/login-form/thumbnail-recovery.png`
  - `services/fixtures/outputs/login-form/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **completed**
- OCR: {'enabled': True, 'words': 0, 'lines': 0, 'groups': 0}
- Macro regions: ['page', 'main', 'section']
- Elements by role/type: `{'page': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'control-region': 1, 'image': 1}`
- Hierarchy depth: 4
- RAG records: ['product-gallery-section', 'product-detail-gallery-page', 'product-detail-section', 'dropdown-select']
- Fidelity (schema-layout gate): {'score': 0.75, 'fullPage': True, 'majorRegionCount': 2, 'leafCount': 4, 'mediaCount': 2, 'buttonCount': 0, 'maxDepth': 4, 'passed': True, 'reasons': ['too few macro regions']}
- Validation: {'valid': True, 'structuralAccuracy': 1}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
