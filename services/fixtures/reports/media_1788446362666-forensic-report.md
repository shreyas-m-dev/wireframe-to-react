# Forensic fixture report: media_1788446362666

- Input: `media_1788446362666.jpg`
- Output: `services/fixtures/outputs/media_1788446362666/`
- Artifacts:
  - `services/fixtures/outputs/media_1788446362666/backend-preview-contract.json`
  - `services/fixtures/outputs/media_1788446362666/canonical-schema.json`
  - `services/fixtures/outputs/media_1788446362666/card-recovery.json`
  - `services/fixtures/outputs/media_1788446362666/card-recovery.png`
  - `services/fixtures/outputs/media_1788446362666/cgda-report.json`
  - `services/fixtures/outputs/media_1788446362666/codegen-schema.json`
  - `services/fixtures/outputs/media_1788446362666/codegen-tree.json`
  - `services/fixtures/outputs/media_1788446362666/component-data-models.json`
  - `services/fixtures/outputs/media_1788446362666/component-ownership-map.json`
  - `services/fixtures/outputs/media_1788446362666/detections-clean.png`
  - `services/fixtures/outputs/media_1788446362666/detections-debug.png`
  - `services/fixtures/outputs/media_1788446362666/detections-elements.json`
  - `services/fixtures/outputs/media_1788446362666/detections.json`
  - `services/fixtures/outputs/media_1788446362666/duplicate-reconciliation.json`
  - `services/fixtures/outputs/media_1788446362666/edge-map.png`
  - `services/fixtures/outputs/media_1788446362666/execution-log.json`
  - `services/fixtures/outputs/media_1788446362666/fidelity.json`
  - `services/fixtures/outputs/media_1788446362666/generated-after-cgda.jsx`
  - `services/fixtures/outputs/media_1788446362666/generated-before-cgda.jsx`
  - `services/fixtures/outputs/media_1788446362666/generated.css`
  - `services/fixtures/outputs/media_1788446362666/generated.jsx`
  - `services/fixtures/outputs/media_1788446362666/grayscale.png`
  - `services/fixtures/outputs/media_1788446362666/input-image.json`
  - `services/fixtures/outputs/media_1788446362666/interaction-graph.json`
  - `services/fixtures/outputs/media_1788446362666/interaction-state-plan.json`
  - `services/fixtures/outputs/media_1788446362666/layout-plan.json`
  - `services/fixtures/outputs/media_1788446362666/macro-zones.png`
  - `services/fixtures/outputs/media_1788446362666/normalized-evidence.json`
  - `services/fixtures/outputs/media_1788446362666/normalized.png`
  - `services/fixtures/outputs/media_1788446362666/ocr-debug.png`
  - `services/fixtures/outputs/media_1788446362666/ocr-status.json`
  - `services/fixtures/outputs/media_1788446362666/ocr.json`
  - `services/fixtures/outputs/media_1788446362666/original-image.jpg`
  - `services/fixtures/outputs/media_1788446362666/page-family-hypotheses.json`
  - `services/fixtures/outputs/media_1788446362666/preprocessing.json`
  - `services/fixtures/outputs/media_1788446362666/rag-query.json`
  - `services/fixtures/outputs/media_1788446362666/rag-results.json`
  - `services/fixtures/outputs/media_1788446362666/raw-evidence.json`
  - `services/fixtures/outputs/media_1788446362666/region-graph.json`
  - `services/fixtures/outputs/media_1788446362666/resolved-interaction-graph.json`
  - `services/fixtures/outputs/media_1788446362666/responsive-layout-plan.json`
  - `services/fixtures/outputs/media_1788446362666/roi-recovery-debug.png`
  - `services/fixtures/outputs/media_1788446362666/roi-recovery.json`
  - `services/fixtures/outputs/media_1788446362666/runtime-validation.json`
  - `services/fixtures/outputs/media_1788446362666/schema-tree.txt`
  - `services/fixtures/outputs/media_1788446362666/schema.json`
  - `services/fixtures/outputs/media_1788446362666/selected-component-tree.json`
  - `services/fixtures/outputs/media_1788446362666/selected-semantic-page-tree.json`
  - `services/fixtures/outputs/media_1788446362666/semantic-candidates.json`
  - `services/fixtures/outputs/media_1788446362666/semantic-ui-plan.json`
  - `services/fixtures/outputs/media_1788446362666/state-dependency-manifest.json`
  - `services/fixtures/outputs/media_1788446362666/static-validation.json`
  - `services/fixtures/outputs/media_1788446362666/style-evidence.json`
  - `services/fixtures/outputs/media_1788446362666/theme-token-plan.json`
  - `services/fixtures/outputs/media_1788446362666/threshold.png`
  - `services/fixtures/outputs/media_1788446362666/thumbnail-recovery.json`
  - `services/fixtures/outputs/media_1788446362666/thumbnail-recovery.png`
  - `services/fixtures/outputs/media_1788446362666/validation.json`
  - `services/fixtures/outputs/media_1788446362666/vision-merge.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 33, 'lines': 15, 'groups': 10}
- Macro regions: ['page', 'header', 'main', 'section', 'footer']
- Elements by role/type: `{'page': 1, 'header': 1, 'container': 14, 'input': 1, 'main': 1, 'media-region': 1, 'section': 1, 'image': 7, 'repeated-region': 1, 'footer': 1, 'copy': 3, 'section-heading': 1, 'nav-link': 7, 'action': 4, 'heading': 1, 'hero-heading': 1, 'nav-group': 1, 'services-section': 1, 'feature-card-grid': 1, 'contact-section': 1, 'form': 1, 'media-thumbnail-strip': 1, 'thumbnail-image': 2}`
- Hierarchy depth: 5
- RAG records: ['product-detail-gallery-page', 'product-detail-section', 'product-gallery-section', 'header-logo-nav-buttons']
- Fidelity (schema-layout gate): {'score': 0.99, 'structuralAccuracy': 0.99, 'fullPage': True, 'majorRegionCount': 6, 'leafCount': 17, 'mediaCount': 6, 'buttonCount': 2, 'maxDepth': 5, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': True, 'duplicateNodeRate': 0, 'macroRoleDuplicateRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'emptyHeadingCount': 0, 'unsupportedLabelCount': 0, 'logoInsideNavCount': 0, 'looseHeroLeafCount': 0, 'looseContactControlCount': 0, 'sourceStructureCoverage': 1, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': 1, 'semanticTextCoverage': 0.53, 'semanticControlCoverage': 0.12, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'fallbackSource': True, 'passed': False, 'overallStatus': 'needs-review', 'reasons': ['Source-vs-rendered visual comparison is pending; result cannot be marked ready.', 'Schema was produced by local-cv-ocr-fallback; review the reconstruction before export.']}
- Validation: {'valid': False, 'structuralAccuracy': 0, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
