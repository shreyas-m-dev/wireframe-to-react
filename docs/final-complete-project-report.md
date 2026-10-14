# Final complete project report

## Objective

Convert an uploaded wireframe plus optional style instructions into a schema-guided, responsive React implementation with truthful reconstruction status.

## Five objectives

1. **Full page detection:** preprocessing preserves source aspect ratio; OCR, macro detection, ROI recovery, repeated-group recovery, and fusion operate on the real image.
2. **Hierarchical schema:** `services/schema/schema.js` produces recursive bounds, order, layout, role, confidence, and evidence nodes.
3. **React generation:** `template_compiler.py::render_node` recursively maps schema nodes to semantic/local JSX and media placeholders without remote URLs.
4. **Optional instructions:** `App.jsx` accepts length-limited design instructions; `instruction_parser.py` applies a controlled style vocabulary and does not alter source-backed structure.
5. **Reliable preview/validation:** `result.code` is canonical for Code/inline/full preview; explicit errors replace no content. Validation separates schema preservation from source coverage.

## Active changes

Key active files: `frontend/src/App.jsx`, `LivePreview.jsx`, `FullViewModal.jsx`, `index.css`, `frontend/scripts/verify_ui_contract.cjs`, `backend/server.js`, `scripts/cli_pipeline.py`, `scripts/run_fixture_pipeline.py`, `scripts/run_validation_from_files.js`, `services/preprocessing/preprocess.py`, `services/detection/ocr_extractor.py`, `ocr_layout_fusion.py`, `services/schema/schema.js`, `services/codegen/template_compiler.py`, `services/cgda/cgda.js`, and `services/validation/*`.

## Real fixtures and metrics

| Fixture | SHA-256 | Dimensions | schemaToCode | macro | repeated | controls | source structure | status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `ecommerce-wireframe.png` | `e66fede6e322aa3b52514771f8e97e3440316a1b91b079f6e2c4c13df8128e24` | 1366×768 | 1.0 | 1.0 | 1.0 | 1.0 | 0.0 | needs-review |
| `landing-wireframe.jpeg` | `f39bfa56259a58d2f2b0eb1e1bb02e18de8bebd3445b6199db239ee0c0ad5e08` | 1024×1536 | 1.0 | 1.0 | 1.0 | 1.0 | 0.25 | needs-review |

The reports and exact input timestamps are under `services/fixtures/reports/*-final-forensic-report.md` and `services/fixtures/outputs/*-final/input-image.json`.

## Full view and UI

Full view supports measured Fit, zoom, reset-to-fit, Escape, focus restoration/trapping, body scroll lock, optional fullscreen, and close buttons. Export/download actions are absent from normal UI. The preview/code artifact contract is `result.code` plus server final-artifact metadata. Generated media has local CSS rendering and no generic remote URLs.

## Testing

Passed: compiler, OCR runtime/fusion, ROI recovery, schema, CGDA, validation, frontend contract, Python compilation, and backend syntax checks. Pytest was not installed in the venv, so pytest-based preprocessing tests were not run. Browser screenshot comparison did not run; source-vs-rendered score remains null. Sandbox filesystem restrictions blocked Vite/esbuild build, not a diagnosed source compile error.

## Future work and limitations

Classical CV/OCR cannot reliably recover every weak-border, perspective/glare, or novel complex layout. Future work needs curated labeled data, a richer reviewed RAG catalog, a model-backed detector, and opt-in screenshot-based evaluation. No external dataset was downloaded, no RAG data ingested, `vectors.sqlite3` remains unchanged, and no accuracy percentage/high-fidelity claim is made.
