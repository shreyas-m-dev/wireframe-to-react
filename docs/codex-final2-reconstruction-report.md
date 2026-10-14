# Final2 reconstruction report

## Scope

This pass used the existing landing fixture and existing local retrieval index only. It did not download data, add fixtures, ingest records, or modify `services/rag/vectors.sqlite3`.

## Finding

The canonical landing tree preserved macro evidence (page, header, main, media, hero, services, about/contact and form regions), but the deterministic compiler could discard the horizontal relationship between overlapping macro siblings. As a result, a source-side media/hero composition was emitted as a vertical sequence. The older fidelity gate also allowed a structurally valid local fallback to look successful even though no source-to-rendered visual comparison had occurred.

## Repair

- `services/codegen/template_compiler.py` now detects a macro split from sibling relative geometry: substantial vertical overlap plus separated horizontal centres. This is generic geometry inference; it is not tied to a fixture, filename, fixed coordinates, or a page category.
- The compiler renders such a `main` region with a responsive two-column macro grid and lets evidence-backed full-width sections span both columns.
- `services/validation/fidelity.js` now reports `structuralAccuracy` separately, caps it below one, and requires a real source-vs-rendered score before it can return `ready`.
- A `local-cv-ocr-fallback` source remains `needs-review` even if a score is supplied by a caller. The backend now passes the job schema source into that gate.

## Fresh landing regression

Command run:

```powershell
set VISION_ENABLED=false
.venv\Scripts\python.exe scripts\run_fixture_pipeline.py services\fixtures\uploads\landing-wireframe.jpeg --name landing-final2
```

Result: `services/fixtures/outputs/landing-final2/` was created with 32 detected elements, OCR enabled (28 words, 11 lines, 10 groups), hierarchy depth 5, and a canonical page/header/main/media/hero/services/contact structure. `generated.jsx` contains the responsive split-grid class on the `main` node. The result is explicitly `needs-review`: no source-versus-rendered screenshot comparison ran, so no visual-fidelity claim is made.

## Verification

```powershell
.venv\Scripts\python.exe services\codegen\test_template_compiler.py
node services\validation\fidelity.test.js
node --check backend\server.js
```

All compiler tests (30) and fidelity tests (4) passed.

## Remaining limitation

The pipeline has no automated browser render plus image-comparison stage yet. Therefore validation can prove schema/code structure and reject unsafe success states, but cannot honestly certify pixel or visual similarity for an uploaded image until that source-to-rendered comparison is implemented and supplied as `sourceVsRenderedScore`.
