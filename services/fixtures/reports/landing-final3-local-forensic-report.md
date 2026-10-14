# Forensic fixture report: landing-final3-local

- Input: `landing-wireframe.jpeg`
- Output: `services/fixtures/outputs/landing-final3-local/`
- Artifacts:
  - `services/fixtures/outputs/landing-final3-local/backend-preview-contract.json`
  - `services/fixtures/outputs/landing-final3-local/canonical-schema.json`
  - `services/fixtures/outputs/landing-final3-local/card-recovery.json`
  - `services/fixtures/outputs/landing-final3-local/card-recovery.png`
  - `services/fixtures/outputs/landing-final3-local/cgda-report.json`
  - `services/fixtures/outputs/landing-final3-local/detections-clean.png`
  - `services/fixtures/outputs/landing-final3-local/detections-debug.png`
  - `services/fixtures/outputs/landing-final3-local/detections-elements.json`
  - `services/fixtures/outputs/landing-final3-local/detections.json`
  - `services/fixtures/outputs/landing-final3-local/duplicate-reconciliation.json`
  - `services/fixtures/outputs/landing-final3-local/edge-map.png`
  - `services/fixtures/outputs/landing-final3-local/execution-log.json`
  - `services/fixtures/outputs/landing-final3-local/fidelity.json`
  - `services/fixtures/outputs/landing-final3-local/generated-after-cgda.jsx`
  - `services/fixtures/outputs/landing-final3-local/generated-before-cgda.jsx`
  - `services/fixtures/outputs/landing-final3-local/generated.jsx`
  - `services/fixtures/outputs/landing-final3-local/grayscale.png`
  - `services/fixtures/outputs/landing-final3-local/input-image.json`
  - `services/fixtures/outputs/landing-final3-local/layout-plan.json`
  - `services/fixtures/outputs/landing-final3-local/macro-zones.png`
  - `services/fixtures/outputs/landing-final3-local/normalized.png`
  - `services/fixtures/outputs/landing-final3-local/ocr-debug.png`
  - `services/fixtures/outputs/landing-final3-local/ocr-status.json`
  - `services/fixtures/outputs/landing-final3-local/ocr.json`
  - `services/fixtures/outputs/landing-final3-local/original-image.jpeg`
  - `services/fixtures/outputs/landing-final3-local/preprocessing.json`
  - `services/fixtures/outputs/landing-final3-local/rag-query.json`
  - `services/fixtures/outputs/landing-final3-local/rag-results.json`
  - `services/fixtures/outputs/landing-final3-local/roi-recovery-debug.png`
  - `services/fixtures/outputs/landing-final3-local/roi-recovery.json`
  - `services/fixtures/outputs/landing-final3-local/schema-tree.txt`
  - `services/fixtures/outputs/landing-final3-local/schema.json`
  - `services/fixtures/outputs/landing-final3-local/threshold.png`
  - `services/fixtures/outputs/landing-final3-local/thumbnail-recovery.json`
  - `services/fixtures/outputs/landing-final3-local/thumbnail-recovery.png`
  - `services/fixtures/outputs/landing-final3-local/validation.json`
  - `services/fixtures/outputs/landing-final3-local/vision-merge.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 28, 'lines': 11, 'groups': 10}
- Macro regions: ['page', 'header', 'main', 'section', 'footer']
- Elements by role/type: `{'page': 1, 'header': 1, 'container': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'repeated-region': 1, 'footer': 1, 'copy': 2, 'action': 4, 'section-heading': 2, 'nav-link': 5, 'hero-heading': 1, 'nav-group': 1, 'hero-section': 1, 'services-section': 1, 'about-section': 1, 'contact-section': 1, 'form': 1, 'media-thumbnail-strip': 1, 'thumbnail-image': 2}`
- Hierarchy depth: 4
- RAG records: ['product-gallery-section', 'product-detail-section', 'product-detail-gallery-page', 'header-logo-nav-buttons']
- Fidelity (schema-layout gate): {'score': 0.99, 'structuralAccuracy': 0.99, 'fullPage': True, 'majorRegionCount': 6, 'leafCount': 17, 'mediaCount': 3, 'buttonCount': 4, 'maxDepth': 4, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': True, 'duplicateNodeRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'sourceStructureCoverage': 1, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 0.59, 'semanticControlCoverage': 0.24, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'fallbackSource': False, 'passed': False, 'overallStatus': 'needs-review', 'reasons': ['Source-vs-rendered visual comparison is pending; result cannot be marked ready.']}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
