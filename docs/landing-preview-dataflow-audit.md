# Landing preview data-flow audit

Audit date: 2026-09-02. This is code-path evidence, not a fidelity claim.

| Question | Verified result |
| --- | --- |
| Backend response field | `GET /api/job/:id/result` in `backend/server.js` returns `code: job.code`. `job.code` is `validation.finalJsx`, after CGDA and validation. |
| Frontend storage | `result` state in `frontend/src/App.jsx`; the final JSX is always `result.code`. |
| Preview component | `LivePreview` in `frontend/src/LivePreview.jsx`. The rendered tab passes `code={result.code}`. |
| Code tab artifact | `CodeView` in `frontend/src/App.jsx` receives the same `result.code` value. |
| Preview source | Final validated JSX only. There is no schema/detection fallback renderer or iframe path. |
| JSX execution | `useCompiledComponent` strips the generator's import/export wrapper, compiles with Babel standalone, then evaluates `GeneratedComponent` with only `React` and `Icon` injected. Arbitrary imports/custom components are not supported; unsupported code surfaces an error. |
| Error handling | `PreviewErrorBoundary` reports the render error and shows an error card. It does not replace the page with a schema mockup. |
| State reset | `select()` clears `result` and preview diagnostics; `run()` clears diagnostics before a new pipeline run. A previous result cannot be previewed after a new file selection. |
| Markers | `data-wireframe-id`, `data-wireframe-type`, `data-wireframe-role`, and `data-wireframe-bounds` are emitted by `template_compiler._marker()` and survive preview compilation. |
| Former 640×480 source | `_render_leaf_tag()` in `services/codegen/template_compiler.py` previously emitted `https://placehold.co/640x480`. It now emits a local aspect-ratio media region, so the preview no longer depends on a remote generic image. |
| Flattened OCR source | `scripts/cli_pipeline.py` created one text element per document OCR line. That line-level strategy can be over-broad when Tesseract groups unrelated columns. It is pipeline input, not a frontend preview fallback. |
| Blank inputs | The compiler’s prior generic input fallback was `Search`; unlabeled inputs now use neutral `Enter value`, while the detector must still provide actual input geometry before an input node exists. |

Developer diagnostics appear only when **Debug mode** is enabled: final JSX hash/length, preview hash/length/source, render success/error, and backend `finalArtifact` id/timestamp. The hashes must match for `previewSourceMatch` to be meaningful.

The actual newly uploaded landing image is not in `services/fixtures/uploads` in this workspace. Consequently no landing-specific artifact, screenshot, or accuracy result is asserted by this audit.
