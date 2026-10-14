# Forensic fixture report: dashboard

- Input: `dashboard_layout.png`
- Output: `services/fixtures/outputs/dashboard/`
- Artifacts:
  - `services/fixtures/outputs/dashboard/card-recovery.json`
  - `services/fixtures/outputs/dashboard/card-recovery.png`
  - `services/fixtures/outputs/dashboard/cgda-report.json`
  - `services/fixtures/outputs/dashboard/detections-clean.png`
  - `services/fixtures/outputs/dashboard/detections-debug.png`
  - `services/fixtures/outputs/dashboard/detections-elements.json`
  - `services/fixtures/outputs/dashboard/detections.json`
  - `services/fixtures/outputs/dashboard/edge-map.png`
  - `services/fixtures/outputs/dashboard/execution-log.json`
  - `services/fixtures/outputs/dashboard/fidelity.json`
  - `services/fixtures/outputs/dashboard/generated-after-cgda.jsx`
  - `services/fixtures/outputs/dashboard/generated-before-cgda.jsx`
  - `services/fixtures/outputs/dashboard/generated.jsx`
  - `services/fixtures/outputs/dashboard/grayscale.png`
  - `services/fixtures/outputs/dashboard/input-image.json`
  - `services/fixtures/outputs/dashboard/layout-plan.json`
  - `services/fixtures/outputs/dashboard/macro-zones.png`
  - `services/fixtures/outputs/dashboard/normalized.png`
  - `services/fixtures/outputs/dashboard/ocr-debug.png`
  - `services/fixtures/outputs/dashboard/ocr-status.json`
  - `services/fixtures/outputs/dashboard/ocr.json`
  - `services/fixtures/outputs/dashboard/original-image.png`
  - `services/fixtures/outputs/dashboard/preprocessing.json`
  - `services/fixtures/outputs/dashboard/rag-query.json`
  - `services/fixtures/outputs/dashboard/rag-results.json`
  - `services/fixtures/outputs/dashboard/roi-recovery-debug.png`
  - `services/fixtures/outputs/dashboard/roi-recovery.json`
  - `services/fixtures/outputs/dashboard/schema-tree.txt`
  - `services/fixtures/outputs/dashboard/schema.json`
  - `services/fixtures/outputs/dashboard/threshold.png`
  - `services/fixtures/outputs/dashboard/thumbnail-recovery.json`
  - `services/fixtures/outputs/dashboard/thumbnail-recovery.png`
  - `services/fixtures/outputs/dashboard/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 0, 'lines': 0, 'groups': 0}
- Macro regions: ['page', 'main', 'section', 'footer']
- Elements by role/type: `{'page': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'container': 1, 'footer': 1}`
- Hierarchy depth: 4
- RAG records: ['product-detail-gallery-page', 'product-gallery-section', 'footer-links-row', 'text-block-lines']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 3, 'leafCount': 4, 'mediaCount': 1, 'buttonCount': 0, 'maxDepth': 4, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 0.42857142857142855}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
