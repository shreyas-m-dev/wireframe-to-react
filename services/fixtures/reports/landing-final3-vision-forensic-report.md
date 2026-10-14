# Forensic fixture report: landing-final3-vision

- Input: `landing-wireframe.jpeg`
- Output: `services/fixtures/outputs/landing-final3-vision/`
- Artifacts:
  - `services/fixtures/outputs/landing-final3-vision/backend-preview-contract.json`
  - `services/fixtures/outputs/landing-final3-vision/canonical-schema.json`
  - `services/fixtures/outputs/landing-final3-vision/card-recovery.json`
  - `services/fixtures/outputs/landing-final3-vision/card-recovery.png`
  - `services/fixtures/outputs/landing-final3-vision/cgda-report.json`
  - `services/fixtures/outputs/landing-final3-vision/detections-clean.png`
  - `services/fixtures/outputs/landing-final3-vision/detections-debug.png`
  - `services/fixtures/outputs/landing-final3-vision/detections-elements.json`
  - `services/fixtures/outputs/landing-final3-vision/detections.json`
  - `services/fixtures/outputs/landing-final3-vision/duplicate-reconciliation.json`
  - `services/fixtures/outputs/landing-final3-vision/edge-map.png`
  - `services/fixtures/outputs/landing-final3-vision/execution-log.json`
  - `services/fixtures/outputs/landing-final3-vision/fidelity.json`
  - `services/fixtures/outputs/landing-final3-vision/generated-after-cgda.jsx`
  - `services/fixtures/outputs/landing-final3-vision/generated-before-cgda.jsx`
  - `services/fixtures/outputs/landing-final3-vision/generated.jsx`
  - `services/fixtures/outputs/landing-final3-vision/grayscale.png`
  - `services/fixtures/outputs/landing-final3-vision/input-image.json`
  - `services/fixtures/outputs/landing-final3-vision/layout-plan.json`
  - `services/fixtures/outputs/landing-final3-vision/macro-zones.png`
  - `services/fixtures/outputs/landing-final3-vision/normalized.png`
  - `services/fixtures/outputs/landing-final3-vision/ocr-debug.png`
  - `services/fixtures/outputs/landing-final3-vision/ocr-status.json`
  - `services/fixtures/outputs/landing-final3-vision/ocr.json`
  - `services/fixtures/outputs/landing-final3-vision/original-image.jpeg`
  - `services/fixtures/outputs/landing-final3-vision/preprocessing.json`
  - `services/fixtures/outputs/landing-final3-vision/rag-query.json`
  - `services/fixtures/outputs/landing-final3-vision/rag-results.json`
  - `services/fixtures/outputs/landing-final3-vision/roi-recovery-debug.png`
  - `services/fixtures/outputs/landing-final3-vision/roi-recovery.json`
  - `services/fixtures/outputs/landing-final3-vision/schema-tree.txt`
  - `services/fixtures/outputs/landing-final3-vision/schema.json`
  - `services/fixtures/outputs/landing-final3-vision/threshold.png`
  - `services/fixtures/outputs/landing-final3-vision/thumbnail-recovery.json`
  - `services/fixtures/outputs/landing-final3-vision/thumbnail-recovery.png`
  - `services/fixtures/outputs/landing-final3-vision/validation.json`
  - `services/fixtures/outputs/landing-final3-vision/vision-merge.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 28, 'lines': 11, 'groups': 10}
- Macro regions: ['page', 'header', 'main', 'section', 'footer']
- Elements by role/type: `{'page': 1, 'header': 1, 'container': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'repeated-region': 1, 'footer': 1, 'copy': 2, 'action': 4, 'section-heading': 2, 'nav-link': 5, 'hero-heading': 1, 'nav-group': 1, 'hero-section': 1, 'services-section': 1, 'about-section': 1, 'contact-section': 1, 'form': 1, 'media-thumbnail-strip': 1, 'thumbnail-image': 2}`
- Hierarchy depth: 4
- RAG records: ['product-detail-section', 'product-gallery-section', 'header-logo-nav-buttons', 'product-detail-gallery-page']
- Fidelity (schema-layout gate): {'score': 0.65, 'structuralAccuracy': 0.65, 'fullPage': True, 'majorRegionCount': 6, 'leafCount': 14, 'mediaCount': 1, 'buttonCount': 3, 'maxDepth': 4, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': False, 'duplicateNodeRate': 0, 'macroRoleDuplicateRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'emptyHeadingCount': 0, 'unsupportedLabelCount': 0, 'logoInsideNavCount': 0, 'looseHeroLeafCount': 0, 'looseContactControlCount': 1, 'sourceStructureCoverage': 1, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 0.71, 'semanticControlCoverage': 0.21, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'fallbackSource': False, 'passed': False, 'overallStatus': 'needs-review', 'reasons': ['Invalid canonical hierarchy: pages=1, duplicateMacros=0, emptyHeadings=0, logoInsideNav=0, looseHero=0, looseContactControls=1', 'Source-vs-rendered visual comparison is pending; result cannot be marked ready.']}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
