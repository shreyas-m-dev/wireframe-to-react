# Forensic fixture report: ecommerce-final

- Input: `ecommerce-wireframe.png`
- Output: `services/fixtures/outputs/ecommerce-final/`
- Artifacts:
  - `services/fixtures/outputs/ecommerce-final/backend-preview-contract.json`
  - `services/fixtures/outputs/ecommerce-final/card-recovery.json`
  - `services/fixtures/outputs/ecommerce-final/card-recovery.png`
  - `services/fixtures/outputs/ecommerce-final/cgda-report.json`
  - `services/fixtures/outputs/ecommerce-final/detections-clean.png`
  - `services/fixtures/outputs/ecommerce-final/detections-debug.png`
  - `services/fixtures/outputs/ecommerce-final/detections-elements.json`
  - `services/fixtures/outputs/ecommerce-final/detections.json`
  - `services/fixtures/outputs/ecommerce-final/edge-map.png`
  - `services/fixtures/outputs/ecommerce-final/execution-log.json`
  - `services/fixtures/outputs/ecommerce-final/fidelity.json`
  - `services/fixtures/outputs/ecommerce-final/generated-after-cgda.jsx`
  - `services/fixtures/outputs/ecommerce-final/generated-before-cgda.jsx`
  - `services/fixtures/outputs/ecommerce-final/generated.jsx`
  - `services/fixtures/outputs/ecommerce-final/grayscale.png`
  - `services/fixtures/outputs/ecommerce-final/input-image.json`
  - `services/fixtures/outputs/ecommerce-final/layout-plan.json`
  - `services/fixtures/outputs/ecommerce-final/macro-zones.png`
  - `services/fixtures/outputs/ecommerce-final/normalized.png`
  - `services/fixtures/outputs/ecommerce-final/ocr-debug.png`
  - `services/fixtures/outputs/ecommerce-final/ocr-status.json`
  - `services/fixtures/outputs/ecommerce-final/ocr.json`
  - `services/fixtures/outputs/ecommerce-final/original-image.png`
  - `services/fixtures/outputs/ecommerce-final/preprocessing.json`
  - `services/fixtures/outputs/ecommerce-final/rag-query.json`
  - `services/fixtures/outputs/ecommerce-final/rag-results.json`
  - `services/fixtures/outputs/ecommerce-final/roi-recovery-debug.png`
  - `services/fixtures/outputs/ecommerce-final/roi-recovery.json`
  - `services/fixtures/outputs/ecommerce-final/schema-tree.txt`
  - `services/fixtures/outputs/ecommerce-final/schema.json`
  - `services/fixtures/outputs/ecommerce-final/threshold.png`
  - `services/fixtures/outputs/ecommerce-final/thumbnail-recovery.json`
  - `services/fixtures/outputs/ecommerce-final/thumbnail-recovery.png`
  - `services/fixtures/outputs/ecommerce-final/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 52, 'lines': 24, 'groups': 12}
- Macro regions: ['page', 'main', 'gallery', 'product-detail', 'footer']
- Elements by role/type: `{'page': 1, 'main': 1, 'gallery': 1, 'product-detail': 1, 'control-region': 1, 'media': 1, 'footer': 1, 'copy': 9, 'nav-link': 6, 'price': 2, 'description': 2, 'product-title': 1, 'rating': 1, 'heading': 3, 'about-section': 1, 'map-region': 1, 'product-area': 1}`
- Hierarchy depth: 5
- RAG records: ['product-detail-gallery-page', 'product-detail-section', 'product-gallery-section', 'footer-links-row']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 5, 'leafCount': 23, 'mediaCount': 2, 'buttonCount': 0, 'maxDepth': 5, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
