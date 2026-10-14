# Forensic fixture report: landing-codex-repaired

- Input: `landing-wireframe.jpeg`
- Output: `services/fixtures/outputs/landing-codex-repaired/`
- Artifacts:
  - `services/fixtures/outputs/landing-codex-repaired/backend-preview-contract.json`
  - `services/fixtures/outputs/landing-codex-repaired/canonical-schema.json`
  - `services/fixtures/outputs/landing-codex-repaired/card-recovery.json`
  - `services/fixtures/outputs/landing-codex-repaired/card-recovery.png`
  - `services/fixtures/outputs/landing-codex-repaired/cgda-report.json`
  - `services/fixtures/outputs/landing-codex-repaired/detections-clean.png`
  - `services/fixtures/outputs/landing-codex-repaired/detections-debug.png`
  - `services/fixtures/outputs/landing-codex-repaired/detections-elements.json`
  - `services/fixtures/outputs/landing-codex-repaired/detections.json`
  - `services/fixtures/outputs/landing-codex-repaired/duplicate-reconciliation.json`
  - `services/fixtures/outputs/landing-codex-repaired/edge-map.png`
  - `services/fixtures/outputs/landing-codex-repaired/execution-log.json`
  - `services/fixtures/outputs/landing-codex-repaired/fidelity.json`
  - `services/fixtures/outputs/landing-codex-repaired/generated-after-cgda.jsx`
  - `services/fixtures/outputs/landing-codex-repaired/generated-before-cgda.jsx`
  - `services/fixtures/outputs/landing-codex-repaired/generated.jsx`
  - `services/fixtures/outputs/landing-codex-repaired/grayscale.png`
  - `services/fixtures/outputs/landing-codex-repaired/input-image.json`
  - `services/fixtures/outputs/landing-codex-repaired/layout-plan.json`
  - `services/fixtures/outputs/landing-codex-repaired/macro-zones.png`
  - `services/fixtures/outputs/landing-codex-repaired/normalized.png`
  - `services/fixtures/outputs/landing-codex-repaired/ocr-debug.png`
  - `services/fixtures/outputs/landing-codex-repaired/ocr-status.json`
  - `services/fixtures/outputs/landing-codex-repaired/ocr.json`
  - `services/fixtures/outputs/landing-codex-repaired/original-image.jpeg`
  - `services/fixtures/outputs/landing-codex-repaired/preprocessing.json`
  - `services/fixtures/outputs/landing-codex-repaired/rag-query.json`
  - `services/fixtures/outputs/landing-codex-repaired/rag-results.json`
  - `services/fixtures/outputs/landing-codex-repaired/roi-recovery-debug.png`
  - `services/fixtures/outputs/landing-codex-repaired/roi-recovery.json`
  - `services/fixtures/outputs/landing-codex-repaired/schema-tree.txt`
  - `services/fixtures/outputs/landing-codex-repaired/schema.json`
  - `services/fixtures/outputs/landing-codex-repaired/threshold.png`
  - `services/fixtures/outputs/landing-codex-repaired/thumbnail-recovery.json`
  - `services/fixtures/outputs/landing-codex-repaired/thumbnail-recovery.png`
  - `services/fixtures/outputs/landing-codex-repaired/validation.json`
  - `services/fixtures/outputs/landing-codex-repaired/vision-merge.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **completed**
- OCR: {'enabled': True, 'words': 28, 'lines': 11, 'groups': 10}
- Macro regions: ['page', 'header', 'main', 'section', 'footer']
- Elements by role/type: `{'page': 1, 'header': 1, 'container': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'repeated-region': 1, 'footer': 1, 'copy': 2, 'action': 4, 'section-heading': 2, 'nav-link': 5, 'hero-heading': 1, 'nav-group': 1, 'hero-section': 1, 'services-section': 1, 'about-section': 1, 'contact-section': 1, 'form': 1, 'media-thumbnail-strip': 1, 'thumbnail-image': 2}`
- Hierarchy depth: 5
- RAG records: ['product-gallery-section', 'product-detail-gallery-page', 'product-detail-section', 'header-logo-nav-buttons']
- Fidelity (schema-layout gate): {'score': 1, 'fullPage': True, 'majorRegionCount': 3, 'leafCount': 15, 'mediaCount': 3, 'buttonCount': 4, 'maxDepth': 5, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': True, 'duplicateNodeRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'sourceStructureCoverage': 0.83, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 0.53, 'semanticControlCoverage': 0.27, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'passed': True, 'overallStatus': 'ready', 'reasons': ['Structure generated; source-vs-rendered visual comparison pending.']}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'pass'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
