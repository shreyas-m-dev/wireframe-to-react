# Forensic fixture report: semantic-compiler-landing

- Input: `landing-wireframe.jpeg`
- Output: `services/fixtures/outputs/semantic-compiler-landing/`
- Artifacts:
  - `services/fixtures/outputs/semantic-compiler-landing/backend-preview-contract.json`
  - `services/fixtures/outputs/semantic-compiler-landing/canonical-schema.json`
  - `services/fixtures/outputs/semantic-compiler-landing/card-recovery.json`
  - `services/fixtures/outputs/semantic-compiler-landing/card-recovery.png`
  - `services/fixtures/outputs/semantic-compiler-landing/cgda-report.json`
  - `services/fixtures/outputs/semantic-compiler-landing/codegen-schema.json`
  - `services/fixtures/outputs/semantic-compiler-landing/codegen-tree.json`
  - `services/fixtures/outputs/semantic-compiler-landing/component-ownership-map.json`
  - `services/fixtures/outputs/semantic-compiler-landing/detections-clean.png`
  - `services/fixtures/outputs/semantic-compiler-landing/detections-debug.png`
  - `services/fixtures/outputs/semantic-compiler-landing/detections-elements.json`
  - `services/fixtures/outputs/semantic-compiler-landing/detections.json`
  - `services/fixtures/outputs/semantic-compiler-landing/duplicate-reconciliation.json`
  - `services/fixtures/outputs/semantic-compiler-landing/edge-map.png`
  - `services/fixtures/outputs/semantic-compiler-landing/execution-log.json`
  - `services/fixtures/outputs/semantic-compiler-landing/fidelity.json`
  - `services/fixtures/outputs/semantic-compiler-landing/generated-after-cgda.jsx`
  - `services/fixtures/outputs/semantic-compiler-landing/generated-before-cgda.jsx`
  - `services/fixtures/outputs/semantic-compiler-landing/generated.jsx`
  - `services/fixtures/outputs/semantic-compiler-landing/grayscale.png`
  - `services/fixtures/outputs/semantic-compiler-landing/input-image.json`
  - `services/fixtures/outputs/semantic-compiler-landing/interaction-graph.json`
  - `services/fixtures/outputs/semantic-compiler-landing/layout-plan.json`
  - `services/fixtures/outputs/semantic-compiler-landing/macro-zones.png`
  - `services/fixtures/outputs/semantic-compiler-landing/normalized-evidence.json`
  - `services/fixtures/outputs/semantic-compiler-landing/normalized.png`
  - `services/fixtures/outputs/semantic-compiler-landing/ocr-debug.png`
  - `services/fixtures/outputs/semantic-compiler-landing/ocr-status.json`
  - `services/fixtures/outputs/semantic-compiler-landing/ocr.json`
  - `services/fixtures/outputs/semantic-compiler-landing/original-image.jpeg`
  - `services/fixtures/outputs/semantic-compiler-landing/preprocessing.json`
  - `services/fixtures/outputs/semantic-compiler-landing/rag-query.json`
  - `services/fixtures/outputs/semantic-compiler-landing/rag-results.json`
  - `services/fixtures/outputs/semantic-compiler-landing/raw-evidence.json`
  - `services/fixtures/outputs/semantic-compiler-landing/resolved-interaction-graph.json`
  - `services/fixtures/outputs/semantic-compiler-landing/roi-recovery-debug.png`
  - `services/fixtures/outputs/semantic-compiler-landing/roi-recovery.json`
  - `services/fixtures/outputs/semantic-compiler-landing/runtime-validation.json`
  - `services/fixtures/outputs/semantic-compiler-landing/schema-tree.txt`
  - `services/fixtures/outputs/semantic-compiler-landing/schema.json`
  - `services/fixtures/outputs/semantic-compiler-landing/selected-component-tree.json`
  - `services/fixtures/outputs/semantic-compiler-landing/selected-semantic-page-tree.json`
  - `services/fixtures/outputs/semantic-compiler-landing/semantic-candidates.json`
  - `services/fixtures/outputs/semantic-compiler-landing/semantic-ui-plan.json`
  - `services/fixtures/outputs/semantic-compiler-landing/state-dependency-manifest.json`
  - `services/fixtures/outputs/semantic-compiler-landing/static-validation.json`
  - `services/fixtures/outputs/semantic-compiler-landing/threshold.png`
  - `services/fixtures/outputs/semantic-compiler-landing/thumbnail-recovery.json`
  - `services/fixtures/outputs/semantic-compiler-landing/thumbnail-recovery.png`
  - `services/fixtures/outputs/semantic-compiler-landing/validation.json`
  - `services/fixtures/outputs/semantic-compiler-landing/vision-merge.json`

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
- Fidelity (schema-layout gate): {'score': 0.99, 'structuralAccuracy': 0.99, 'fullPage': True, 'majorRegionCount': 6, 'leafCount': 13, 'mediaCount': 1, 'buttonCount': 3, 'maxDepth': 4, 'schemaToCodeCoverage': 1, 'canonicalNodeCoverage': 1, 'canonicalTreeValidity': True, 'duplicateNodeRate': 0, 'macroRoleDuplicateRate': 0, 'orphanCount': 0, 'emptySemanticParents': 0, 'emptyHeadingCount': 0, 'unsupportedLabelCount': 0, 'logoInsideNavCount': 0, 'looseHeroLeafCount': 0, 'looseContactControlCount': 0, 'sourceStructureCoverage': 1, 'layoutBoundsCoverage': None, 'styleCueCoverage': None, 'repeatedGroupCoverage': None, 'semanticTextCoverage': 0.69, 'semanticControlCoverage': 0.23, 'sourceVsRenderedScore': None, 'visualComparisonPending': True, 'fallbackSource': True, 'passed': False, 'overallStatus': 'needs-review', 'reasons': ['Source-vs-rendered visual comparison is pending; result cannot be marked ready.', 'Schema was produced by local-cv-ocr-fallback; review the reconstruction before export.']}
- Validation: {'valid': True, 'structuralAccuracy': 1, 'overallStatus': 'needs-review'}

## Difference from frontend upload
The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.

## Limitations
Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured.
