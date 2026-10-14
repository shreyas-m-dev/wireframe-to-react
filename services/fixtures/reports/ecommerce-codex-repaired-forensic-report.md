# Forensic fixture report: ecommerce-codex-repaired

- Input: `ecommerce-wireframe.png`
- Output: `services/fixtures/outputs/ecommerce-codex-repaired/`
- Artifacts:
  - `services/fixtures/outputs/ecommerce-codex-repaired/backend-preview-contract.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/canonical-schema.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/card-recovery.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/card-recovery.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/cgda-report.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/detections-clean.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/detections-debug.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/detections-elements.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/detections.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/duplicate-reconciliation.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/edge-map.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/execution-log.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/fidelity.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/generated-after-cgda.jsx`
  - `services/fixtures/outputs/ecommerce-codex-repaired/generated-before-cgda.jsx`
  - `services/fixtures/outputs/ecommerce-codex-repaired/generated.jsx`
  - `services/fixtures/outputs/ecommerce-codex-repaired/grayscale.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/input-image.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/layout-plan.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/macro-zones.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/normalized.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/ocr-debug.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/ocr-status.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/ocr.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/original-image.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/preprocessing.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/rag-query.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/rag-results.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/roi-recovery-debug.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/roi-recovery.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/schema-tree.txt`
  - `services/fixtures/outputs/ecommerce-codex-repaired/schema.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/threshold.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/thumbnail-recovery.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/thumbnail-recovery.png`
  - `services/fixtures/outputs/ecommerce-codex-repaired/validation.json`
  - `services/fixtures/outputs/ecommerce-codex-repaired/vision-merge.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 52, 'lines': 24, 'groups': 12}
- Macro regions: ['page', 'main', 'gallery', 'product-detail', 'footer']
- Elements by role/type: `{'page': 1, 'main': 1, 'gallery': 1, 'product-detail': 1, 'control-region': 1, 'media': 1, 'footer': 1, 'copy': 9, 'nav-link': 6, 'price': 2, 'description': 2, 'product-title': 1, 'rating': 1, 'heading': 3, 'about-section': 1, 'map-region': 1, 'product-area': 1}`
- Hierarchy depth: 5
- RAG records: ['product-detail-gallery-page', 'product-detail-section', 'product-gallery-section', 'header-logo-nav-buttons']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 4, 'leafCount': 20, 'mediaCount': 2, 'buttonCount': 0, 'maxDepth': 5, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': True, 'duplicateNodeRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'sourceStructureCoverage': 0.33, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 1.2, 'semanticControlCoverage': None, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'passed': True, 'overallStatus': 'ready', 'reasons': ['Structure generated; source-vs-rendered visual comparison pending.']}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
