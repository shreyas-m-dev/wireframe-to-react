# Final delivery report

## Completed changes

- Removed every reachable export/download control from `frontend/src/App.jsx`; the backend helper remains internal and is not UI-reachable.
- Added `frontend/src/FullViewModal.jsx`: semantic modal dialog, Escape close, focus restoration/trap, scroll lock, fit/zoom/reset, and optional browser fullscreen.
- Added source and generated-preview Full view controls. The preview modal renders the same `result.code` supplied to the inline preview and Code tab.
- Canonical artifact state is `result.code`; backend now returns `artifactId`, SHA-256 `finalCodeHash`, byte length, and timestamp in `job.finalArtifact`.
- Media compiler output is local CSS (`role="img"`, detected `aspectRatio`, source-bound markers), with no remote placeholder URL.
- Preprocessing now preserves aspect ratio, preventing tall pages from being forcibly square-stretched.
- OCR container ownership is prevented from flattening full-page text. Validation now makes landing/ecommerce expectations category-specific and reports `needs-review` for insufficient source recovery.

## Real fixture evidence

| Fixture | SHA-256 | Dimensions | Modified UTC | schemaToCodeCoverage | macroRegionCoverage | repeatedGroupCoverage | semanticControlCoverage | sourceStructureCoverage | overallStatus |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `ecommerce-wireframe.png` | `e66fede6e322aa3b52514771f8e97e3440316a1b91b079f6e2c4c13df8128e24` | 1366×768 | 2026-08-31T13:52:47Z | 1.0 | 1.0 | 1.0 | 1.0 | 0.0 | needs-review |
| `landing-wireframe.jpeg` | `f39bfa56259a58d2f2b0eb1e1bb02e18de8bebd3445b6199db239ee0c0ad5e08` | 1024×1536 | 2026-09-01T19:12:15Z | 1.0 | 1.0 | 1.0 | 1.0 | 0.25 | needs-review |

Final forensic reports: `services/fixtures/reports/ecommerce-final-forensic-report.md` and `services/fixtures/reports/landing-real-final-forensic-report.md`.

## Tests

Passed: compiler (30), OCR runtime, OCR layout fusion, ROI recovery, schema (9), CGDA (10), validation (7), frontend full-view/export/artifact source contract, Node backend syntax, and Python compile checks.

Not run: pytest preprocessing suite because `pytest` is absent from `.venv`; install it locally with `& .\.venv\Scripts\python.exe -m pip install pytest` if permitted. Browser screenshot/preview execution was not run, so preview execution metrics and source-vs-rendered score remain null. `npm --prefix frontend run build` was attempted but the sandbox denied esbuild filesystem access; this is not evidence of a source compilation error.

## Local verification

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
$env:PYTHON_BIN = (Resolve-Path .\.venv\Scripts\python.exe)
npm --prefix backend start
npm --prefix frontend run dev
```

Upload `services/fixtures/uploads/landing-wireframe.jpeg`, verify no export/download action exists, use Source and Preview **Full view**, press Escape to close, test zoom/fit/reset, then enable Debug mode and confirm the Code/Preview artifact diagnostics correspond. Preview errors must be explicit, never schema fallbacks.

## Remaining limitations

This remains a classical CV + OCR reconstruction system. Perspective/glare, weak borders, OCR mistakes, complex unseen layouts, and the absence of trained vision weights limit structural recovery. The landing run still misses feature-card-grid, split-content, and map-region evidence; the ecommerce run still lacks some specialized control evidence. No pixel-perfect/high-fidelity claim is made without browser screenshot comparison.

No dataset was downloaded, no RAG records were ingested, and `services/rag/vectors.sqlite3` was unchanged.
