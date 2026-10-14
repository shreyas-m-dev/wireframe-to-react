# Forensic fixture report: ecommerce-wireframe

- Input: `ecommerce-wireframe.png`
- Output: `services/fixtures/outputs/ecommerce-wireframe/`
- Artifacts:
  - `services/fixtures/outputs/ecommerce-wireframe/backend-preview-contract.json`
  - `services/fixtures/outputs/ecommerce-wireframe/canonical-schema.json`
  - `services/fixtures/outputs/ecommerce-wireframe/card-recovery.json`
  - `services/fixtures/outputs/ecommerce-wireframe/card-recovery.png`
  - `services/fixtures/outputs/ecommerce-wireframe/cgda-report.json`
  - `services/fixtures/outputs/ecommerce-wireframe/codegen-schema.json`
  - `services/fixtures/outputs/ecommerce-wireframe/codegen-tree.json`
  - `services/fixtures/outputs/ecommerce-wireframe/component-data-models.json`
  - `services/fixtures/outputs/ecommerce-wireframe/component-ownership-map.json`
  - `services/fixtures/outputs/ecommerce-wireframe/detections-clean.png`
  - `services/fixtures/outputs/ecommerce-wireframe/detections-debug.png`
  - `services/fixtures/outputs/ecommerce-wireframe/detections-elements.json`
  - `services/fixtures/outputs/ecommerce-wireframe/detections.json`
  - `services/fixtures/outputs/ecommerce-wireframe/duplicate-reconciliation.json`
  - `services/fixtures/outputs/ecommerce-wireframe/edge-map.png`
  - `services/fixtures/outputs/ecommerce-wireframe/execution-log.json`
  - `services/fixtures/outputs/ecommerce-wireframe/fidelity.json`
  - `services/fixtures/outputs/ecommerce-wireframe/generated-after-cgda.jsx`
  - `services/fixtures/outputs/ecommerce-wireframe/generated-before-cgda.jsx`
  - `services/fixtures/outputs/ecommerce-wireframe/generated.css`
  - `services/fixtures/outputs/ecommerce-wireframe/generated.jsx`
  - `services/fixtures/outputs/ecommerce-wireframe/grayscale.png`
  - `services/fixtures/outputs/ecommerce-wireframe/input-image.json`
  - `services/fixtures/outputs/ecommerce-wireframe/interaction-graph.json`
  - `services/fixtures/outputs/ecommerce-wireframe/interaction-state-plan.json`
  - `services/fixtures/outputs/ecommerce-wireframe/layout-plan.json`
  - `services/fixtures/outputs/ecommerce-wireframe/macro-zones.png`
  - `services/fixtures/outputs/ecommerce-wireframe/normalized-evidence.json`
  - `services/fixtures/outputs/ecommerce-wireframe/normalized.png`
  - `services/fixtures/outputs/ecommerce-wireframe/ocr-debug.png`
  - `services/fixtures/outputs/ecommerce-wireframe/ocr-status.json`
  - `services/fixtures/outputs/ecommerce-wireframe/ocr.json`
  - `services/fixtures/outputs/ecommerce-wireframe/original-image.png`
  - `services/fixtures/outputs/ecommerce-wireframe/page-family-hypotheses.json`
  - `services/fixtures/outputs/ecommerce-wireframe/preprocessing.json`
  - `services/fixtures/outputs/ecommerce-wireframe/rag-query.json`
  - `services/fixtures/outputs/ecommerce-wireframe/rag-results.json`
  - `services/fixtures/outputs/ecommerce-wireframe/raw-evidence.json`
  - `services/fixtures/outputs/ecommerce-wireframe/region-graph.json`
  - `services/fixtures/outputs/ecommerce-wireframe/resolved-interaction-graph.json`
  - `services/fixtures/outputs/ecommerce-wireframe/responsive-layout-plan.json`
  - `services/fixtures/outputs/ecommerce-wireframe/roi-recovery-debug.png`
  - `services/fixtures/outputs/ecommerce-wireframe/roi-recovery.json`
  - `services/fixtures/outputs/ecommerce-wireframe/runtime-validation.json`
  - `services/fixtures/outputs/ecommerce-wireframe/schema-tree.txt`
  - `services/fixtures/outputs/ecommerce-wireframe/schema.json`
  - `services/fixtures/outputs/ecommerce-wireframe/selected-component-tree.json`
  - `services/fixtures/outputs/ecommerce-wireframe/selected-semantic-page-tree.json`
  - `services/fixtures/outputs/ecommerce-wireframe/semantic-candidates.json`
  - `services/fixtures/outputs/ecommerce-wireframe/semantic-ui-plan.json`
  - `services/fixtures/outputs/ecommerce-wireframe/state-dependency-manifest.json`
  - `services/fixtures/outputs/ecommerce-wireframe/static-validation.json`
  - `services/fixtures/outputs/ecommerce-wireframe/style-evidence.json`
  - `services/fixtures/outputs/ecommerce-wireframe/theme-token-plan.json`
  - `services/fixtures/outputs/ecommerce-wireframe/threshold.png`
  - `services/fixtures/outputs/ecommerce-wireframe/thumbnail-recovery.json`
  - `services/fixtures/outputs/ecommerce-wireframe/thumbnail-recovery.png`
  - `services/fixtures/outputs/ecommerce-wireframe/validation.json`
  - `services/fixtures/outputs/ecommerce-wireframe/vision-merge.json`

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
- Validation: {'valid': False, 'structuralAccuracy': 0, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
