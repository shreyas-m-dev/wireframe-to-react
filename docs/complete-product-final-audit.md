# Complete product final audit

## Active flow

`App.jsx::run` stores a selected image and optional instructions, uploads it to Express, runs the staged API sequence, and stores one canonical `result`. `server.js::validateJob` produces `job.code = validation.finalJsx` plus `job.finalArtifact`; `CodeView`, inline `LivePreview`, and full-view `LivePreview` all receive `result.code`.

`cli_pipeline.py::cmd_detect` runs aspect-preserving preprocessing, OCR, heuristic macro/component detection, OCR fusion, ROI recovery, then reports disabled vision status. `schema.js::buildSchema` establishes containment/order. `template_compiler.py::render_node` recursively emits local JSX; CGDA filters tags and validation distinguishes schema coverage from source coverage.

## Bottlenecks

Landing misses feature-card grid, split-content, and map geometry because classical divider/ROI recovery is incomplete. Ecommerce misses some specialized controls because OCR/contours cannot always distinguish selector/action boundaries. Neither run uses a vision model. Their current statuses are needs-review, not success claims.

The prior Full View Fit failure was `FullViewModal::fit` setting scale to one. The active implementation now measures `viewer.clientWidth/clientHeight` against content `scrollWidth/scrollHeight`, recomputing after open, resize, and fullscreen change.

No normal frontend export/download UI remains. Historical backend export helper is not reachable from `App.jsx`. Active generated JSX comes from `validation.finalJsx`; no active remote placeholder path exists. Generic output originates only when the evidence-backed schema has neutral/incomplete nodes.

## Deterministic versus future vision reasoning

OCR, geometry, dividers, repeated alignment, containment, and visual order are deterministic improvements. Full semantic interpretation of ambiguous sections requires stronger layout/vision reasoning. `services/vision/` now defines a disabled-by-default, strict-schema-only provider seam; no provider has been configured or called.
