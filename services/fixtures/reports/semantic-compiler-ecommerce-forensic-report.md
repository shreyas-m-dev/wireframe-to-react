# Forensic fixture report: semantic-compiler-ecommerce

- Input: `ecommerce-wireframe.png`
- Output: `services/fixtures/outputs/semantic-compiler-ecommerce/`
- Artifacts:
  - `services/fixtures/outputs/semantic-compiler-ecommerce/backend-preview-contract.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/canonical-schema.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/card-recovery.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/card-recovery.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/cgda-report.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/codegen-schema.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/codegen-tree.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/component-ownership-map.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/detections-clean.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/detections-debug.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/detections-elements.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/detections.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/duplicate-reconciliation.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/edge-map.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/execution-log.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/fidelity.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/generated-after-cgda.jsx`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/generated-before-cgda.jsx`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/generated.jsx`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/grayscale.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/input-image.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/interaction-graph.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/layout-plan.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/macro-zones.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/normalized-evidence.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/normalized.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/ocr-debug.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/ocr-status.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/ocr.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/original-image.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/preprocessing.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/rag-query.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/rag-results.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/raw-evidence.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/resolved-interaction-graph.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/roi-recovery-debug.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/roi-recovery.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/runtime-validation.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/schema-tree.txt`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/schema.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/selected-component-tree.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/selected-semantic-page-tree.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/semantic-candidates.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/semantic-ui-plan.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/state-dependency-manifest.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/static-validation.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/threshold.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/thumbnail-recovery.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/thumbnail-recovery.png`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/validation.json`
  - `services/fixtures/outputs/semantic-compiler-ecommerce/vision-merge.json`

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
- Fidelity (schema-layout gate): {'score': 0.65, 'structuralAccuracy': 0.65, 'fullPage': True, 'majorRegionCount': 4, 'leafCount': 7, 'mediaCount': 2, 'buttonCount': 0, 'maxDepth': 5, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': False, 'duplicateNodeRate': 0, 'macroRoleDuplicateRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'emptyHeadingCount': 0, 'unsupportedLabelCount': 0, 'logoInsideNavCount': 0, 'looseHeroLeafCount': 1, 'looseContactControlCount': 0, 'sourceStructureCoverage': 1, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 1, 'semanticControlCoverage': 0, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'fallbackSource': True, 'passed': False, 'overallStatus': 'needs-review', 'reasons': ['Invalid canonical hierarchy: pages=1, duplicateMacros=0, emptyHeadings=0, logoInsideNav=0, looseHero=1, looseContactControls=0', 'Source-vs-rendered visual comparison is pending; result cannot be marked ready.', 'Schema was produced by local-cv-ocr-fallback; review the reconstruction before export.']}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
