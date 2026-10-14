# Forensic fixture report: vision-local-fallback

- Input: `landing-wireframe.jpeg`
- Output: `services/fixtures/outputs/vision-local-fallback/`
- Artifacts:
  - `services/fixtures/outputs/vision-local-fallback/backend-preview-contract.json`
  - `services/fixtures/outputs/vision-local-fallback/card-recovery.json`
  - `services/fixtures/outputs/vision-local-fallback/card-recovery.png`
  - `services/fixtures/outputs/vision-local-fallback/cgda-report.json`
  - `services/fixtures/outputs/vision-local-fallback/detections-clean.png`
  - `services/fixtures/outputs/vision-local-fallback/detections-debug.png`
  - `services/fixtures/outputs/vision-local-fallback/detections-elements.json`
  - `services/fixtures/outputs/vision-local-fallback/detections.json`
  - `services/fixtures/outputs/vision-local-fallback/edge-map.png`
  - `services/fixtures/outputs/vision-local-fallback/execution-log.json`
  - `services/fixtures/outputs/vision-local-fallback/fidelity.json`
  - `services/fixtures/outputs/vision-local-fallback/generated-after-cgda.jsx`
  - `services/fixtures/outputs/vision-local-fallback/generated-before-cgda.jsx`
  - `services/fixtures/outputs/vision-local-fallback/generated.jsx`
  - `services/fixtures/outputs/vision-local-fallback/grayscale.png`
  - `services/fixtures/outputs/vision-local-fallback/input-image.json`
  - `services/fixtures/outputs/vision-local-fallback/layout-plan.json`
  - `services/fixtures/outputs/vision-local-fallback/macro-zones.png`
  - `services/fixtures/outputs/vision-local-fallback/normalized.png`
  - `services/fixtures/outputs/vision-local-fallback/ocr-debug.png`
  - `services/fixtures/outputs/vision-local-fallback/ocr-status.json`
  - `services/fixtures/outputs/vision-local-fallback/ocr.json`
  - `services/fixtures/outputs/vision-local-fallback/original-image.jpeg`
  - `services/fixtures/outputs/vision-local-fallback/preprocessing.json`
  - `services/fixtures/outputs/vision-local-fallback/rag-query.json`
  - `services/fixtures/outputs/vision-local-fallback/rag-results.json`
  - `services/fixtures/outputs/vision-local-fallback/roi-recovery-debug.png`
  - `services/fixtures/outputs/vision-local-fallback/roi-recovery.json`
  - `services/fixtures/outputs/vision-local-fallback/schema-tree.txt`
  - `services/fixtures/outputs/vision-local-fallback/schema.json`
  - `services/fixtures/outputs/vision-local-fallback/threshold.png`
  - `services/fixtures/outputs/vision-local-fallback/thumbnail-recovery.json`
  - `services/fixtures/outputs/vision-local-fallback/thumbnail-recovery.png`
  - `services/fixtures/outputs/vision-local-fallback/validation.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 28, 'lines': 11, 'groups': 10}
- Macro regions: ['page', 'header', 'main', 'section', 'footer']
- Elements by role/type: `{'page': 1, 'header': 1, 'container': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'repeated-region': 1, 'footer': 1, 'copy': 2, 'action': 5, 'section-heading': 2, 'nav-link': 4, 'hero-heading': 1, 'nav-group': 1, 'hero-section': 1, 'services-section': 1, 'about-section': 1, 'contact-section': 1, 'form': 1, 'media-thumbnail-strip': 1, 'thumbnail-image': 2}`
- Hierarchy depth: 5
- RAG records: ['product-gallery-section', 'product-detail-gallery-page', 'product-detail-section', 'header-logo-nav-buttons']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 4, 'leafCount': 20, 'mediaCount': 3, 'buttonCount': 5, 'maxDepth': 5, 'passed': True, 'reasons': []}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
