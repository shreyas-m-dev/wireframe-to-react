# Review 1 complete project report

## Product goal and objectives

The project turns an uploaded wireframe plus optional style instructions into a hierarchy-guided React page, code view, rendered preview, and truthful validation. The five objectives are full-page detection, correct schema hierarchy, recursive ready-page generation, image-plus-instruction styling, and artifact-consistent preview/full-view validation.

## Completed implementation

- **Detection:** local aspect-preserving preprocessing, installed Tesseract OCR, macro/ROI/repeated recovery, and geometry/OCR fusion. Vision status is explicit in detection metadata.
- **Schema:** recursive source bounds, normalized bounds, roles, evidence, confidence, order, and containment via `services/schema/schema.js`.
- **Generation:** recursive `template_compiler.py::render_node` produces semantic/local React JSX, local aspect-ratio media, and no remote placeholder dependency.
- **Instructions:** `App.jsx` provides a 1,500-character optional instruction field; `instruction_parser.py` has controlled styling tokens. Image geometry remains authoritative.
- **Preview/full view:** one `result.code` reaches Code, inline preview, and full preview. `FullViewModal` provides measured Fit, zoom/reset, fullscreen enhancement, Escape, focus management, and scroll lock.
- **Validation:** reports schema preservation separately from source structure. It truthfully returns needs-review for incomplete recovered regions.

## Fixture results and status

The final real landing pipeline reports vision `used: false`, provider disabled, and remains needs-review because it lacks feature-card-grid, split-content, and map-region recovery. Ecommerce remains needs-review due missing specialized thumbnail/select/action evidence. See `services/fixtures/reports/ecommerce-final-forensic-report.md` and `landing-real-final-forensic-report.md`; generic historical fixtures are not used to make accuracy claims.

## UX and safety

Normal UI contains no Export, Download, or ZIP action. Generated media has no remote generic URL. Debug mode exposes artifact/preview identity; normal mode remains clean. The optional vision interface is disabled/local fallback by default; no provider API key has been configured or used.

## Tests

Passed: vision disabled-schema test, instruction parser (28), frontend full-view/export/artifact contract, OCR runtime/fusion, ROI recovery, compiler, schema, CGDA, validation, Python compilation, backend syntax, and real ecommerce/landing fixture pipelines. Browser visual test is pending; no screenshot or source-vs-rendered score exists. Pytest is absent from the venv. Sandbox blocked Vite/esbuild filesystem access during build; local build should be retried outside the sandbox.

## Start and demo

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
$env:PYTHON_BIN = (Resolve-Path .\.venv\Scripts\python.exe)
npm --prefix backend start
npm --prefix frontend run dev
```

Follow [review1-demo-script.md](review1-demo-script.md) for the 3–5 minute demo. Explain that image structure controls layout, instructions control allowed styling, and needs-review is an honest incomplete-reconstruction state.

## Future work

Curated data, a reviewed RAG expansion, a configured vision provider or trained local detector, and held-out browser screenshot evaluation are needed for stronger reconstruction. No external dataset was downloaded, no RAG records were ingested, `vectors.sqlite3` was unchanged, and no unmeasured accuracy percentage is claimed.
