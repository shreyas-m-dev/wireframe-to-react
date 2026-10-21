# Wireframe → React

Upload a wireframe image and get a React + Tailwind component you can preview, inspect and export as a runnable Vite project. Accounts and projects are stored in Supabase (Auth + Postgres). The generation pipeline runs locally and deterministically by default: no AI provider is called unless you opt in.

> **Status (2026-10-19):** P0 security and foundation work is complete and tested, but this is **not production-ready**.
> - Deployment and CI are not set up.
> - Supabase sign-in has been verified with locally signed test tokens, not yet against a live project.
>
> See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for verified scores and test results.

## How it works

```
upload ─▶ preprocess ─▶ detect (OpenCV + Tesseract OCR) ─▶ schema tree ─▶ semantic plan ─▶ RAG template retrieval
       ─▶ generate JSX (deterministic compiler) ─▶ CGDA filter ─▶ validate ─▶ compile preview ─▶ sandboxed preview / export
```

- **Detection** is classical computer vision (contours and shape rules), not a trained model.
- **Generation** defaults to a deterministic template compiler (`GEN_MODE=template`): the same image and instructions give the same code.
- **CGDA** parses the generated JSX with `@babel/parser` and removes any element the schema can't account for: unknown `data-wireframe-id`, a tag not allowed for that node, or an undefined component.
- **Validation** checks that every schema node is present in the code, that the code parses, and that state and handlers exist. It then compiles a preview bundle on the server.
- **Fidelity** is reported as an *advisory* score. It needs a source-vs-render visual comparison that isn't implemented yet, so it never gates the job status.
- **Preview** runs only inside a sandboxed, opaque-origin iframe with its own CSP (no network, no access to the app or your session).
- **Jobs** run in the background with concurrency limits, per-stage timeouts and cancel. History is stored per project.

## Run it locally

### Prerequisites

- Node.js **22.9+**, Python **3.10+**
- **Tesseract OCR** (system binary)
  - Windows: [UB-Mannheim build](https://github.com/UB-Mannheim/tesseract/wiki)
  - macOS: `brew install tesseract`
  - Debian/Ubuntu: `apt install tesseract-ocr`
- A **Supabase** project (the free tier is enough). Setup checklist: [docs/AUTH_AND_DATA_MODEL.md §7](docs/AUTH_AND_DATA_MODEL.md)

### Setup

```bash
python -m venv .venv
```
```bash
.venv/Scripts/python -m pip install -r requirements.txt
```
```bash
npm install
```
Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `DATABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PYTHON_BIN` and `TESSERACT_CMD`. Every variable is described in [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md). Then create the tables:
```bash
npm run migrate
```

### Start

```bash
npm run dev:backend
```
```bash
npm run dev:frontend
```
Open http://localhost:5173, create an account, confirm your email, then create a project and upload a wireframe.

### Tests

```bash
npm test
```
```bash
npm run test:py
```
- `npm test` runs the assertion gate plus the services, backend and frontend suites. The two browser end-to-end tests need a local Chrome or Edge (`CHROME_PATH`) and a prior `npm run build`; without them they are reported as **skipped**, never as passed.
- `npm run test:py` runs every Python test file (pytest-style files through `python -m pytest`) and reports each one's real result.

**Windows "Python was not found" message:** that's the Microsoft Store alias, not Python. Set `PYTHON_BIN` to your venv's `python.exe`.

## Optional: AI providers

Both options below are **off by default** and send data to a third party:
- `GEN_MODE=llm` (Gemini or OpenRouter) sends the layout schema and instructions.
- `VISION_ENABLED=true` sends the uploaded image.

Keys stay server-side. Vision diagnostics endpoints are restricted to `ADMIN_USER_IDS`.

## Repository layout

```
backend/    Express API: src/{auth,db,http,jobs,pipeline,routes}, db/migrations, test/
frontend/   React 18 + Vite + Tailwind: src/{auth,workspace,ui,lib}, preview/ (sandbox frame), test/
services/   Pipeline stages: preprocessing, detection, vision, schema, semantic, rag, codegen, cgda, validation
scripts/    cli_pipeline.py (Python entry point), test runners, smoke_api.js
docs/       PROJECT_AUDIT, IMPROVEMENT_ROADMAP, DESIGN_SYSTEM, AUTH_AND_DATA_MODEL, SECURITY_REVIEW,
            ENVIRONMENT_VARIABLES, IMPLEMENTATION_STATUS (current); other files are historical run reports
```

## Known limitations

- **Detection:** the heuristic detector can misread low-contrast, dense or photographic mockups.
- **Retrieval:** RAG is lexical (TF-IDF), not semantic.
- **Copy:** the compiler never invents text. Elements without readable OCR text get neutral placeholders.
- **Fidelity:** conversion is structural, not pixel-perfect. Review spacing, copy and imagery before shipping exported code.
- **Single node:** jobs queue in-process, and uploaded images are stored on local disk. See SECURITY_REVIEW R-6/R-7 for the scale-out plan.
