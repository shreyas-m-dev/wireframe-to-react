# Complete project baseline audit

## Architecture and data path

The active application is React/Vite (`frontend/src/App.jsx`) plus Express (`backend/server.js`) plus Python CV/OCR (`scripts/cli_pipeline.py`). `App::run` uses upload → process → detect → schema → generate → validate → result. `server.js::detectJob` invokes `cmd_detect`; `generateJob` invokes `generate_from_schema`; `validateJob` stores `validation.finalJsx` as `job.code` and attaches `finalArtifact` metadata.

`CodeView` and both inline/full `LivePreview` calls receive the exact `result.code` string. The preview compiler is `LivePreview::useCompiledComponent`; it executes generated JSX or shows an explicit error. There is no schema fallback. The active detector combines `preprocess.py` aspect-preserving resize/normalization, `ocr_extractor.py`, `heuristic_detector.py` macro/component contours, `ocr_layout_fusion.py`, and `roi_recovery.py`.

## Baseline gaps and causes

- Landing recovery still lacks services card-grid, split content, and map region. This is classical line/contour and ROI grouping coverage, not preview inconsistency.
- Ecommerce recovery still lacks some specialized control evidence. Product specialization is evidence-gated in `ocr_layout_fusion.py`.
- The original Full View Fit implementation only reset scale to one. `FullViewModal` now computes a measured fit scale from viewer/client and content/scroll dimensions and recomputes after resize/fullscreen changes.
- Current generator is recursive (`template_compiler.py::render_node`) and local-media only. It lacks a trained visual model, so neutral regions remain when semantic recovery is insufficient.
- Normal UI has no export/download control. Full filesystem fixture artifacts are development-only.

## Measured baselines

`ecommerce-final`: schema-to-code 1.0, source structure 0.0, needs-review. `landing-real-final`: schema-to-code 1.0, source structure 0.25, needs-review. These are schema preservation metrics, not visual-fidelity claims.

## Prioritized plan

1. Preserve full page geometry and measured viewer behavior.
2. Improve generic macro/ROI evidence and schema grouping only when visible geometry supports it.
3. Keep recursive local React generation based on the normalized tree.
4. Keep instructions style-only and image-structure-first.
5. Maintain artifact consistency and truthfully gate reconstruction status.
