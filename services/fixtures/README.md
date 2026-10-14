# Development fixture workflow

This folder is intentionally empty of third-party data. It is a local,
development-only workflow and does not participate in production uploads.

Place an image in `uploads/` and create a matching expected description in
`expected/<name>.json`. Generated artifacts belong in `outputs/`; readable
reports belong in `reports/`.

```powershell
# from repository root
Copy-Item C:\path\to\sample.png services\fixtures\uploads\product-page.png
$env:PYTHON_BIN = (Resolve-Path .\.venv\Scripts\python.exe)
& $env:PYTHON_BIN scripts\cli_pipeline.py preprocess services\fixtures\uploads\product-page.png
& $env:PYTHON_BIN scripts\cli_pipeline.py detect services\fixtures\uploads\product-page.png
```

Run the full, safe fixture workflow with the command below. It uses the same
preprocessing and detection CLI path as the backend, builds the schema,
queries the legacy template catalog in SQLite **read-only mode**, generates
JSX through the shared generation function, runs shared CGDA/validation, and
writes a report. Large schemas and JSX are passed to Node only by file path,
never through `node -e`. It never indexes or writes `services/rag/vectors.sqlite3`.

```powershell
& $env:PYTHON_BIN scripts\run_fixture_pipeline.py services\fixtures\uploads\product-page.png --name product-page
```

PNG and JPG are both supported:

```powershell
& $env:PYTHON_BIN scripts\run_fixture_pipeline.py services\fixtures\uploads\ecommerce-wireframe.png --name ecommerce
& $env:PYTHON_BIN scripts\run_fixture_pipeline.py services\fixtures\uploads\ecommerce-wireframe.jpg --name ecommerce
```

For the ecommerce fixture, copy it to `services/fixtures/uploads/` and replace
`product-page.png` with the actual filename. The report is written to
`services/fixtures/reports/product-page-forensic-report.md`; artifacts are in
`services/fixtures/outputs/product-page/`. Each run deterministically overwrites
only the artifact files owned by the runner. A failed stage preserves all files
produced by that run and records its stdout/stderr in `execution-log.json`.

The fixture command is not a replacement for normal use: start the backend and
frontend, upload an image, then use the process/generate controls. Fixtures are
developer evidence for regression, forensics, and reproducible debugging; debug
overlays, RAG scores, and internal reports are not shown in the normal UI.

The output contract is `input-image.json`, `preprocessing.json`, original image
copy, `grayscale.png`, `normalized.png`, `threshold.png`, `edge-map.png`,
`macro-zones.png`, `detections-clean.png`, `detections-debug.png`,
`detections.json`, `ocr-status.json` (and, when enabled, `ocr.json` and
`ocr-debug.png`), `schema.json`, `schema-tree.txt`, `rag-query.json`,
`rag-results.json`, `layout-plan.json`, `generated.jsx`, `validation.json`,
`fidelity.json`, and `execution-log.json`.

OCR uses one shared resolver (`services/detection/ocr.py`) for the backend CLI
and this fixture workflow. It checks `TESSERACT_CMD`, standard Windows install
locations, then PATH. Every run writes `ocr-status.json`; when enabled it also
writes word/line/group evidence to `ocr.json` and debug-only boxes to
`ocr-debug.png`.

Run the existing regression suites with the Python environment configured for
OpenCV/NumPy/Tesseract:

```powershell
& $env:PYTHON_BIN scripts\test_e2e_integration.py
node services\schema\schema.test.js
node services\schema\product_layout.test.js
node services\validation\fidelity.test.js
& $env:PYTHON_BIN services\codegen\test_template_compiler.py
& $env:PYTHON_BIN scripts\test_fixture_file_runner.py
& $env:PYTHON_BIN services\detection\test_ocr_runtime.py
& $env:PYTHON_BIN scripts\test_fixture_ocr_regression.py
```

Do not check private/customer uploads into source control. Record the test
result using the format in `docs/detection-and-layout-audit.md`.
