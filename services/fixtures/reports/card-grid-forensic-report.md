# Forensic fixture report: card-grid

- Input: `card_grid.png`
- Output: `services/fixtures/outputs/card-grid/`
- Artifacts:
  - `services/fixtures/outputs/card-grid/card-recovery.json`
  - `services/fixtures/outputs/card-grid/card-recovery.png`
  - `services/fixtures/outputs/card-grid/cgda-report.json`
  - `services/fixtures/outputs/card-grid/detections-clean.png`
  - `services/fixtures/outputs/card-grid/detections-debug.png`
  - `services/fixtures/outputs/card-grid/detections-elements.json`
  - `services/fixtures/outputs/card-grid/detections.json`
  - `services/fixtures/outputs/card-grid/edge-map.png`
  - `services/fixtures/outputs/card-grid/execution-log.json`
  - `services/fixtures/outputs/card-grid/fidelity.json`
  - `services/fixtures/outputs/card-grid/generated-after-cgda.jsx`
  - `services/fixtures/outputs/card-grid/generated-before-cgda.jsx`
  - `services/fixtures/outputs/card-grid/generated.jsx`
  - `services/fixtures/outputs/card-grid/grayscale.png`
  - `services/fixtures/outputs/card-grid/input-image.json`
  - `services/fixtures/outputs/card-grid/layout-plan.json`
  - `services/fixtures/outputs/card-grid/macro-zones.png`
  - `services/fixtures/outputs/card-grid/normalized.png`
  - `services/fixtures/outputs/card-grid/ocr-debug.png`
  - `services/fixtures/outputs/card-grid/ocr-status.json`
  - `services/fixtures/outputs/card-grid/ocr.json`
  - `services/fixtures/outputs/card-grid/original-image.png`
  - `services/fixtures/outputs/card-grid/preprocessing.json`
  - `services/fixtures/outputs/card-grid/rag-query.json`
  - `services/fixtures/outputs/card-grid/rag-results.json`
  - `services/fixtures/outputs/card-grid/roi-recovery-debug.png`
  - `services/fixtures/outputs/card-grid/roi-recovery.json`
  - `services/fixtures/outputs/card-grid/schema-tree.txt`
  - `services/fixtures/outputs/card-grid/schema.json`
  - `services/fixtures/outputs/card-grid/threshold.png`
  - `services/fixtures/outputs/card-grid/thumbnail-recovery.json`
  - `services/fixtures/outputs/card-grid/thumbnail-recovery.png`
  - `services/fixtures/outputs/card-grid/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 0, 'lines': 0, 'groups': 0}
- Macro regions: ['page', 'header', 'main', 'section']
- Elements by role/type: `{'page': 1, 'header': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'repeated-region': 1, 'container': 1}`
- Hierarchy depth: 4
- RAG records: ['product-detail-gallery-page', 'product-gallery-section', 'header-logo-nav-buttons', 'text-block-lines']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 3, 'leafCount': 4, 'mediaCount': 1, 'buttonCount': 0, 'maxDepth': 4, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 0.25}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
