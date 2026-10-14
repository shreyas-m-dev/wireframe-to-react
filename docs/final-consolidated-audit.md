# Final consolidated audit

Audit date: 2026-09-02. The active repository was inspected before this completion pass. Real inputs are `services/fixtures/uploads/ecommerce-wireframe.png` and `services/fixtures/uploads/landing-wireframe.jpeg`; synthetic preprocessing fixtures are not used as evidence for either report.

## Active data flow

1. `frontend/src/App.jsx::run` uploads the selected `File` to `POST /api/upload`, then calls process, detect, schema, generate, validate, and `GET /api/job/:id/result`.
2. `backend/server.js` stores the final validation result in `job.code`; `validateJob` creates `job.finalArtifact` from the same validated string.
3. `App` stores the full result in its sole `result` state. `CodeView` receives `result.code`; `LivePreview` receives that identical `result.code` and the artifact metadata.
4. `LivePreview` compiles only that code through Babel standalone. It has no schema/detection fallback; failures are explicit error UI. New selection/run clears `result` and diagnostics.

## Pipeline flow

`backend/server.js::callPython` invokes `scripts/cli_pipeline.py::cmd_detect`: input validation → aspect-preserving preprocessing → OCR document/word extraction → heuristic macro/component detection → OCR fusion → ROI recovery. `services/schema/schema.js::buildSchema` builds containment/reading-order hierarchy. `cli_pipeline.py::generate_from_schema` invokes deterministic `services/codegen/template_compiler.py`; `services/cgda/cgda.js::runCgda` filters tags, then `services/validation/validate.js` checks the final JSX and `fidelity.js` gates source-structure claims.

## Artifact and placeholder facts

- Code and inline preview use the exact same `result.code` final validated artifact. Debug diagnostics compare code/preview fingerprints and show the server artifact id/timestamp.
- Current media generation is local CSS `<div role="img">` with aspect ratio from `relativeBounds`; no active generator emits `placehold.co` or a 640×480 URL. Historical fixture artifacts may contain old URLs but are not active source.
- A blank input can only be emitted from an actual schema `input`; neutral text uses `Enter value`. Container OCR is excluded from label claiming to prevent a flat page-wide OCR block.
- There is no schema preview fallback. Existing Babel CDN failure is an explicit preview error, not a substitute render.
- Export functionality intentionally deferred until reconstruction fidelity is reliable.

## Current reconstruction gaps

The landing real run recognizes header/hero/services/about/contact evidence but still misses feature-card-grid, split-content, and map-region geometry. This comes from classical contours/ROI thresholds in `services/detection/heuristic_detector.py`, `roi_recovery.py`, and evidence gating in `ocr_layout_fusion.py`, not from the preview path. Ecommerce remains dependent on the same evidence-gated classical recovery; its product specialization must not leak to non-product pages.

Generalizable behavior is geometry/OCR/containment/reading-order inference. Filename checks, fixed coordinates, exact text, card counts, and page-category assumptions are prohibited.
