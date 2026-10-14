# Codex repaired reconstruction report

## Root cause fixed

Devin's canonical reconciler assumed every node contained `bbox.x/y/width/height`.
The active CV/OCR pipeline emits top-level `x/y/width/height`, so IoU accessed a
missing `x` key and the caller reduced the exception to `vision merge rejected:
'x'`. It also incorrectly nested the vision node list during category reporting.

`canonical_reconciliation.normalize_bounds` now accepts canonical objects,
LTRB, arrays, normalized 0..1, normalized 0..1000, and pixels. Each rejected
node gets a safe source/id/role/raw-bounds/reason diagnostic. All IoU and
duplicate processing uses canonical bounds only.

## Status semantics

An attempted provider/merge failure now reports
`local-cv-ocr-fallback`, `providerError=true`, and remains needs-review via the
visual-comparison-pending fidelity gate. Schema/code marker coverage is not
visual fidelity.

## Remaining verification

The current environment cannot make the provider fixture request. Run the
vision-enabled landing and ecommerce fixtures in the permitted runtime and
inspect `canonical-schema.json`, `vision-merge.json`, and
`duplicate-reconciliation.json`. Browser comparison remains pending until a
real browser screenshot is captured.

## Local regression artifacts

Fresh local-fallback runs completed as `landing-codex-repaired` (32 accepted
elements) and `ecommerce-codex-repaired` (34 accepted elements). They verify
the repaired merge boundary and artifact generation, not provider-assisted
visual fidelity.

## Commands

```powershell
npm --prefix .\backend start
npm --prefix .\frontend run dev
Invoke-RestMethod -Method Post http://localhost:3000/api/vision/smoke-test
.venv\Scripts\python.exe scripts\run_fixture_pipeline.py services\fixtures\uploads\landing-wireframe.jpeg --name landing-codex-repaired
.venv\Scripts\python.exe scripts\run_fixture_pipeline.py services\fixtures\uploads\ecommerce-wireframe.png --name ecommerce-codex-repaired
.venv\Scripts\python.exe services\vision\test_canonical_reconciliation.py
node services\validation\fidelity.test.js
```
