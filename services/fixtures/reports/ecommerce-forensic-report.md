# Forensic fixture report: ecommerce

- Input: `ecommerce-wireframe.png`
- Output: `services/fixtures/outputs/ecommerce/`
- Artifacts:
  - `services/fixtures/outputs/ecommerce/card-recovery.json`
  - `services/fixtures/outputs/ecommerce/card-recovery.png`
  - `services/fixtures/outputs/ecommerce/cgda-report.json`
  - `services/fixtures/outputs/ecommerce/detections-clean.png`
  - `services/fixtures/outputs/ecommerce/detections-debug.png`
  - `services/fixtures/outputs/ecommerce/detections-elements.json`
  - `services/fixtures/outputs/ecommerce/detections.json`
  - `services/fixtures/outputs/ecommerce/edge-map.png`
  - `services/fixtures/outputs/ecommerce/execution-log.json`
  - `services/fixtures/outputs/ecommerce/fidelity.json`
  - `services/fixtures/outputs/ecommerce/generated-after-cgda.jsx`
  - `services/fixtures/outputs/ecommerce/generated-before-cgda.jsx`
  - `services/fixtures/outputs/ecommerce/generated.jsx`
  - `services/fixtures/outputs/ecommerce/grayscale.png`
  - `services/fixtures/outputs/ecommerce/input-image.json`
  - `services/fixtures/outputs/ecommerce/layout-plan.json`
  - `services/fixtures/outputs/ecommerce/macro-zones.png`
  - `services/fixtures/outputs/ecommerce/normalized.png`
  - `services/fixtures/outputs/ecommerce/ocr-debug.png`
  - `services/fixtures/outputs/ecommerce/ocr-status.json`
  - `services/fixtures/outputs/ecommerce/ocr.json`
  - `services/fixtures/outputs/ecommerce/original-image.png`
  - `services/fixtures/outputs/ecommerce/preprocessing.json`
  - `services/fixtures/outputs/ecommerce/rag-query.json`
  - `services/fixtures/outputs/ecommerce/rag-results.json`
  - `services/fixtures/outputs/ecommerce/roi-recovery-debug.png`
  - `services/fixtures/outputs/ecommerce/roi-recovery.json`
  - `services/fixtures/outputs/ecommerce/schema-tree.txt`
  - `services/fixtures/outputs/ecommerce/schema.json`
  - `services/fixtures/outputs/ecommerce/threshold.png`
  - `services/fixtures/outputs/ecommerce/thumbnail-recovery.json`
  - `services/fixtures/outputs/ecommerce/thumbnail-recovery.png`
  - `services/fixtures/outputs/ecommerce/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **completed**
- OCR: {'enabled': True, 'words': 55, 'lines': 20, 'groups': 12}
- Macro regions: ['page', 'main', 'gallery', 'product-detail', 'related-products', 'footer', 'header']
- Elements by role/type: `{'page': 1, 'main': 1, 'gallery': 1, 'product-detail': 1, 'control-region': 4, 'media': 1, 'icon': 1, 'related-products': 1, 'footer': 1, 'nav-link': 5, 'description': 3, 'section-heading': 1, 'cart-action': 1, 'price': 1, 'rating': 1, 'heading': 1, 'product-title': 1, 'header': 1, 'nav-group': 1, 'product-area': 1, 'product-card-grid': 2, 'thumbnail-gallery': 1, 'thumbnail-image': 3, 'product-card': 5}`
- Hierarchy depth: 5
- RAG records: ['product-detail-gallery-page', 'product-gallery-section', 'product-detail-section', 'card-image-title-text']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 6, 'leafCount': 27, 'mediaCount': 5, 'buttonCount': 0, 'maxDepth': 5, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 1}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
