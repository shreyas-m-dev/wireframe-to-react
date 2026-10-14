# Placeholder and artifact consistency audit

Audit date: 2026-09-02; real fixture: `services/fixtures/uploads/landing-wireframe.jpeg`.

## Root cause

The old implementation of `services/codegen/template_compiler.py::_render_leaf_tag` emitted `<img src="https://placehold.co/640x480">` for every `image` node. CGDA does not alter attribute values, so both pre- and post-CGDA fixture artifacts retained that URL. Existing artifacts under `services/fixtures/outputs/*` are historical snapshots and therefore remain evidence of the old generator; they are not the current code path or a frontend cache.

## Current path

- `template_compiler._render_leaf_tag(image)` now emits a local `<div role="img">` with `style={{ aspectRatio: "…" }}` calculated from `node.relativeBounds.width / height`.
- `scripts/cli_pipeline.py::generate_from_schema` supplies that JSX to the Node validation bridge.
- `scripts/run_validation_from_files.js` writes `generated-before-cgda.jsx` and `generated-after-cgda.jsx`; CGDA preserves the local media node and never rewrites image sources.
- `backend/server.js::validateJob` stores `validation.finalJsx` in `job.code` and records a server artifact hash/id/timestamp.
- `frontend/src/App.jsx` passes `result.code` to both `CodeView` and `LivePreview`. There is no schema preview renderer, iframe renderer, or substitute media fallback.
- `frontend/src/LivePreview.jsx` executes that supplied JSX or renders an explicit error card. A new file selection and a new run clear stale `result`/preview diagnostics.

The pasted URL came from a stale artifact generated before this repair, not current `template_compiler.py`. Restart any already-running backend process after this code change; in-memory Node code cannot hot-reload. The frontend also needs a refresh/rebuild to load the updated preview component.

## Remote-media policy

Current generated fixture JSX contains no `placehold.co`, `http://`, or `https://` URL. The backend preview contract records all detected remote URLs. The compiler test `test_media_is_local_and_uses_detected_aspect_ratio` fails if a remote URL or 640×480 fallback is reintroduced.

## Artifact identity

The fixture contract is `backend-preview-contract.json`; it records final JSX SHA-256, byte length, artifact id/time, static-validation outcome, unsupported imports/components, remote URLs, and the expected `generated-jsx` preview source. Browser execution remains a separate opt-in fact and is not inferred from static validation.
