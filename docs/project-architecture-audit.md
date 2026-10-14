# Project architecture audit

Audit date: 2026-09-01. Scope is repository inspection only. No dataset was
downloaded and `services/rag/vectors.sqlite3` was inspected read-only.

## Architecture and data flow

```text
React/Vite UI (frontend/src/App.jsx)
  -> Express job API (backend/server.js)
     POST /api/upload -> temporary OS upload file
     POST /api/process -> scripts/cli_pipeline.py preprocess
     POST /api/detect  -> CLI OpenCV/OCR detection
     POST /api/schema  -> services/schema/schema.js
     POST /api/generate -> CLI RAG + deterministic compiler or optional LLM
     POST /api/validate -> CGDA + schema/code + fidelity checks
  -> React output tabs / in-browser Babel preview

Python path:
preprocess.py -> heuristic_detector.py + ocr_extractor.py -> normalized elements
RAG path:
retrieve.py -> VectorDB.search() -> templates -> template_compiler.py or generate.py prompt
Node path:
buildSchema() -> runCgda() -> validateWithRetryAsync() + evaluateFidelity()
```

## File inventory

| Area | Files | Role |
|---|---|---|
| API | `backend/server.js` | Express job orchestration, Multer upload, Python subprocess calls, export/result endpoints. |
| API support | `backend/python_resolver.js`, `python_resolver.test.js` | Resolves Python executable, including Windows Store stub protection. |
| Export | `backend/project_export.js` | Dependency-free generated-project ZIP writer. |
| Preprocess | `services/preprocessing/preprocess.py`, `README.md`, `tests/test_preprocess.py`, `tests/run_tests_standalone.py` | Validation, resize, grayscale, Gaussian blur, normalization and tests. |
| CV detector | `services/detection/heuristic_detector.py`, `test_heuristic_detector.py` | Active OpenCV contour/macro-layout detector. |
| OCR | `services/detection/ocr_extractor.py`, `test_ocr_extractor.py` | Tesseract word/line extraction, label attachment, line masking. |
| Optional model | `services/detection/detect.py`, `sidecar.py`, `test_detect.py`, `requirements.txt` | Unwired YOLOv8 adapter/Flask sidecar; requires weights, Ultralytics and Flask. |
| Schema | `services/schema/schema.js`, `schema.test.js`, `product_layout.test.js` | Role-first layout tree, containment, normalized bounds and product regression. |
| RAG | `services/rag/vector_db.py`, `retrieve.py`, `test_retrieve.py`, `seed_templates/templates.json`, `vectors.sqlite3` | SQLite catalog, runtime TF-IDF/optional FAISS search, retrieval metadata. |
| Codegen | `services/codegen/template_compiler.py`, `instruction_parser.py`, `generate.py`, tests | Default deterministic JSX compiler, instruction parser, optional Gemini/OpenRouter LLM. |
| Safety | `services/cgda/cgda.js`, `cgda.test.js` | JSX tokenizer/whitelist filter. |
| Validation | `services/validation/validate.js`, `fidelity.js`, tests | Schema/tag comparison, retry and source-schema fidelity gate. |
| UI | `frontend/src/App.jsx`, `LivePreview.jsx`, `CodeView.jsx`, `AppErrorBoundary.jsx`, `PipelineSchematic.jsx`, `main.jsx`, `index.css` | Upload/workspace, preview, copy UI, boundaries, styling. |
| UI tooling | `frontend/index.html`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, package files | Vite/Tailwind build configuration. |
| Scripts | `scripts/cli_pipeline.py`, `test_e2e_integration.py`, `test_backend_edge_cases.py`, `test_realistic_wireframes.py`, `test_instructions_integration.py`, `test_frontend_slow_response.py`, `measure_metrics.py`, `run_full_pipeline_demo.py` | CLI bridge, integration/edge/performance/demo checks. |
| Fixtures | `services/preprocessing/fixtures/*` | Existing small synthetic PNG fixtures and fixture generator. |
| Configuration | `requirements.txt`, `backend/package.json`, `frontend/package.json`, `.env.example`, `README.md` | Runtime dependencies, scripts and setup. |

No Dockerfile, Compose file, YAML CI pipeline, Ollama integration, OpenAI API integration, Claude integration, DETR integration, segmentation model, screenshot-comparison engine, persistent MongoDB, or persistent job store exists in the inspected tree.

## Stage contracts

| Stage | Functions/classes | Input | Output |
|---|---|---|---|
| Input | `validate_input`, `run_pipeline` | image bytes/path | validated normalized pixel matrix + shapes/warnings |
| Detection | `cmd_detect`, `detect_from_array`, OCR extractors | normalized 1024×1024 image | element dictionaries: type/confidence/x/y/width/height/role/optional label |
| Schema | `buildSchema` | flat elements | nested root with `bbox`, `relativeBounds`, `layout`, `role`, `evidence`, `children`, `layoutPlan` |
| Retrieval | `build_index`, `retrieve_layout_context` | schema tree | ranked reviewed template records |
| Generation | `compile_schema` or `generate_code` | schema + retrieved records | JSX source string |
| Constraint | `runCgda` | JSX + schema | filtered JSX and stripped-tag report |
| Validation | `validateWithRetryAsync`, `evaluateFidelity` | schema + JSX | structural diff, retry log, fidelity report |

## Active vs unused paths

The real default request path is heuristic OpenCV + optional OCR + deterministic compiler. `GEN_MODE=llm` activates `generate.py`, but requires an API key and network. `detect.py`/`sidecar.py` are optional and are not called by `scripts/cli_pipeline.py`; no model weights are present. The UI preview evaluates generated JSX with CDN-loaded Babel, so it is not a production-isolated renderer.

## Failure points

- The active detector is rules/contours, not trained visual understanding.
- Uploads live in an OS temporary directory and job state is an in-memory `Map`; restart loses both.
- `build_index()` writes/upserts seed records during generation; it is not read-only.
- `vectors.sqlite3` is a catalog, not a persisted embedding index.
- OCR degrades when Tesseract is absent; it is intentionally swallowed by the CLI.
- CGDA is regex/tokenizer based, not a complete JSX AST parser.
- The current environment's configured Python cannot import NumPy/OpenCV, so real CV/RAG execution was not verifiable here.
