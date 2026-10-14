# Forensic fixture report: page-family-auth

- Input: `login_form.png`
- Output: `services/fixtures/outputs/page-family-auth/`
- Artifacts:
  - `services/fixtures/outputs/page-family-auth/backend-preview-contract.json`
  - `services/fixtures/outputs/page-family-auth/canonical-schema.json`
  - `services/fixtures/outputs/page-family-auth/card-recovery.json`
  - `services/fixtures/outputs/page-family-auth/card-recovery.png`
  - `services/fixtures/outputs/page-family-auth/cgda-report.json`
  - `services/fixtures/outputs/page-family-auth/codegen-schema.json`
  - `services/fixtures/outputs/page-family-auth/codegen-tree.json`
  - `services/fixtures/outputs/page-family-auth/component-data-models.json`
  - `services/fixtures/outputs/page-family-auth/component-ownership-map.json`
  - `services/fixtures/outputs/page-family-auth/detections-clean.png`
  - `services/fixtures/outputs/page-family-auth/detections-debug.png`
  - `services/fixtures/outputs/page-family-auth/detections-elements.json`
  - `services/fixtures/outputs/page-family-auth/detections.json`
  - `services/fixtures/outputs/page-family-auth/duplicate-reconciliation.json`
  - `services/fixtures/outputs/page-family-auth/edge-map.png`
  - `services/fixtures/outputs/page-family-auth/execution-log.json`
  - `services/fixtures/outputs/page-family-auth/fidelity.json`
  - `services/fixtures/outputs/page-family-auth/generated-after-cgda.jsx`
  - `services/fixtures/outputs/page-family-auth/generated-before-cgda.jsx`
  - `services/fixtures/outputs/page-family-auth/generated.jsx`
  - `services/fixtures/outputs/page-family-auth/grayscale.png`
  - `services/fixtures/outputs/page-family-auth/input-image.json`
  - `services/fixtures/outputs/page-family-auth/interaction-graph.json`
  - `services/fixtures/outputs/page-family-auth/layout-plan.json`
  - `services/fixtures/outputs/page-family-auth/macro-zones.png`
  - `services/fixtures/outputs/page-family-auth/normalized-evidence.json`
  - `services/fixtures/outputs/page-family-auth/normalized.png`
  - `services/fixtures/outputs/page-family-auth/ocr-debug.png`
  - `services/fixtures/outputs/page-family-auth/ocr-status.json`
  - `services/fixtures/outputs/page-family-auth/ocr.json`
  - `services/fixtures/outputs/page-family-auth/original-image.png`
  - `services/fixtures/outputs/page-family-auth/page-family-hypotheses.json`
  - `services/fixtures/outputs/page-family-auth/preprocessing.json`
  - `services/fixtures/outputs/page-family-auth/rag-query.json`
  - `services/fixtures/outputs/page-family-auth/rag-results.json`
  - `services/fixtures/outputs/page-family-auth/raw-evidence.json`
  - `services/fixtures/outputs/page-family-auth/region-graph.json`
  - `services/fixtures/outputs/page-family-auth/resolved-interaction-graph.json`
  - `services/fixtures/outputs/page-family-auth/roi-recovery-debug.png`
  - `services/fixtures/outputs/page-family-auth/roi-recovery.json`
  - `services/fixtures/outputs/page-family-auth/runtime-validation.json`
  - `services/fixtures/outputs/page-family-auth/schema-tree.txt`
  - `services/fixtures/outputs/page-family-auth/schema.json`
  - `services/fixtures/outputs/page-family-auth/selected-component-tree.json`
  - `services/fixtures/outputs/page-family-auth/selected-semantic-page-tree.json`
  - `services/fixtures/outputs/page-family-auth/semantic-candidates.json`
  - `services/fixtures/outputs/page-family-auth/semantic-ui-plan.json`
  - `services/fixtures/outputs/page-family-auth/state-dependency-manifest.json`
  - `services/fixtures/outputs/page-family-auth/static-validation.json`
  - `services/fixtures/outputs/page-family-auth/threshold.png`
  - `services/fixtures/outputs/page-family-auth/thumbnail-recovery.json`
  - `services/fixtures/outputs/page-family-auth/thumbnail-recovery.png`
  - `services/fixtures/outputs/page-family-auth/validation.json`
  - `services/fixtures/outputs/page-family-auth/vision-merge.json`

## Pipeline
- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`
- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`
- RAG: read-only compatibility query; `vectors.sqlite3` was not modified.
- Outcome: **needs review**
- OCR: {'enabled': True, 'words': 1, 'lines': 1, 'groups': 1}
- Macro regions: ['page', 'main', 'section']
- Elements by role/type: `{'page': 1, 'control-region': 1, 'main': 1, 'media-region': 1, 'section': 1, 'media': 1, 'image': 1, 'heading': 1}`
- Hierarchy depth: 5
- RAG records: ['product-detail-gallery-page', 'product-gallery-section', 'product-detail-section', 'dropdown-select']
- Fidelity (schema-layout gate): {'score': 0.99, 'structuralAccuracy': 0.99, 'fullPage': True, 'majorRegionCount': 3, 'leafCount': 2, 'mediaCount': 3, 'buttonCount': 0, 'maxDepth': 5, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': True, 'duplicateNodeRate': 0, 'macroRoleDuplicateRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'emptyHeadingCount': 0, 'unsupportedLabelCount': 0, 'logoInsideNavCount': 0, 'looseHeroLeafCount': 0, 'looseContactControlCount': 0, 'sourceStructureCoverage': 1, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 0.5, 'semanticControlCoverage': 0, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'fallbackSource': True, 'passed': False, 'overallStatus': 'needs-review', 'reasons': ['Too few leaf elements for a full-page reconstruction', 'Source-vs-rendered visual comparison is pending; result cannot be marked ready.', 'Schema was produced by local-cv-ocr-fallback; review the reconstruction before export.']}
- Validation: {'valid': True, 'structuralAccuracy': 0.16666666666666666, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
