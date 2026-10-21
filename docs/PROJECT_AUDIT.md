# Project Audit — Wireframe → React

**Date:** 2026-10-19 · **Commit audited:** `1b732d1` (only commit; working tree clean) · **Stage:** 1 (discovery) + 2 (audit & scoring). No source code has been changed.

Everything below comes from files read, commands run, and behaviour observed in this audit. Where something was *not* verified, that is stated.

---

## 1. Verdict

| | |
|---|---|
| **Overall verified score** | **3.7 / 10** (unweighted mean of 21 feature scores, §5) |
| **Production-ready?** | **No.** 4 release blockers are absent outright (auth, persistent DB, deployment/CI, export) and 3 are present but broken (CGDA, validation, preview sandbox). |
| **What works** | The offline pipeline produces parseable React for real wireframes: upload → preprocess → detect → OCR → schema → codegen ran end-to-end on 4 fixtures (one more than once) and returned 0.9–16 KB of JSX that passes the server-side Babel parser gate. |
| **README "169/169 tests pass"** | **False.** 32 test files: 21 exit 0 (1 of them a SKIP), 11 fail. Details in §3. |

### Release blockers (severity-ranked)

1. **No authentication or authorization.** Every endpoint is anonymous. Anyone who can reach the server can read any job by ID and trigger paid vision-provider calls.
2. **No persistent storage.** Jobs live in `const jobs = new Map()` (`backend/server.js:24`). The Map is never evicted and is wiped on restart.
3. **Validation is non-functional.** Because the stubbed `parseJsx` returns `{}`, `diffTrees` always sees zero code nodes, so *every* job reports `structuralAccuracy: 0`, runs 3 pointless regenerations, and ends `low_fidelity`. Observed on job `404a3ef2…`: `attempts: 3, acc: 0, missing: 19`.
4. **CGDA is a no-op that claims to be a safety net.** `runCgda` returns its input unchanged with `hallucinationRate: 0` (`services/cgda/cgda.js:122-134`).
5. **The preview runs generated code in the app's own origin.** `new Function(...)` in `frontend/src/previewTransform.js:8`, with no iframe, no CSP and no SRI on the Babel CDN script. Once auth exists, this becomes a session-theft vector.
6. **Open CORS (`Access-Control-Allow-Origin: *`, observed), no rate limiting, unbounded Python subprocess spawning.**
7. **No deployment, CI, health/readiness separation, or structured logging.**

---

## 2. Repository architecture (as it actually is)

```
frontend/  React 18 + Vite 5 + Tailwind 3. App.jsx (32 lines, minified-style), LivePreview, CodeView, FullViewModal.
           Babel standalone 7.25.6 from unpkg (pinned, no SRI) for in-browser JSX execution.
backend/   Express 4.22 + Multer 1.4.5-lts.2 + cors. server.js = 159 lines, many >1,000 chars.
           Stage API: /api/upload → /process → /detect → /schema → /generate → /validate → /job/:id/result
           Also: /api/vision/smoke-test, /api/vision/gemini/models, /api/vision/status, /api/health
           Spawns `python scripts/cli_pipeline.py <subcommand>` per stage via execFile (no shell).
scripts/   cli_pipeline.py (417 lines) — subcommands preprocess|detect|style|generate|generate-file|vision-smoke|vision-gemini-models
services/  preprocessing (py) · detection + OCR (py, OpenCV + Tesseract) · vision (py, optional OpenAI/Anthropic/Gemini)
           schema (js) · semantic/ui_plan (js) · rag (py, SQLite + TF-IDF) · codegen (py, deterministic template compiler, optional LLM)
           cgda (js, stub) · validation (js) · visual/style_extractor (py)
```

**Runtime facts observed**
- Node 22.20.0; project `.venv` = Python 3.11.5 with OpenCV 4.10, pytesseract, faiss-cpu, scikit-learn. **pytest is not installed.** Tesseract is at the `.env` path.
- One full stage run takes **43–56 s** per image (4 runs). How much of that is the 3 wasted regenerations was not separately timed.
- `backend/server.js:48` does `require('../frontend/node_modules/@babel/core')`, so the backend silently depends on the frontend's install.
- Uploads (`os.tmpdir()/wireframe-uploads`) and per-job runtime dirs (`os.tmpdir()/w2r/<jobId>`) are **never deleted**.
- `scripts/cli_pipeline.py:349` calls `build_index()` on every generate. That **upserts all templates into the git-tracked `services/rag/vectors.sqlite3`** (the "read-only" catalog), which dirtied the working tree during this audit. I restored it with `git checkout`. Concurrent jobs would contend for SQLite write locks.
- `/api/vision/status` reports `lastVisionCallStatus: "provider-error"` even when vision is disabled, which is a status-mapping bug. The status is also a **process-global** shared across all callers.
- Every response carries `X-Powered-By: Express`. There is no CSP, HSTS or X-Frame-Options.
- A text file renamed `.png` is **accepted at `/api/upload`** (extension-only filter, `server.js:64`) and only rejected later, at `/api/process`, by the Python decoder.

> ⚠️ **Disclosure.** The local `.env` has `VISION_ENABLED=true`, `VISION_PROVIDER=gemini` and an API key configured (values not printed). My first smoke run used that config, so **3 fixture wireframes (landing, ecommerce, login-form) were sent to Gemini**. All later runs forced `VISION_ENABLED=false`.

---

## 3. Section-0 claim verification

| Claim in brief | Verdict | Evidence |
|---|---|---|
| No authentication of any kind | ✅ Confirmed | No user/session code anywhere; all routes anonymous |
| No persistent app DB; jobs in in-memory Map | ✅ Confirmed | `server.js:24`; `/api/health` job count only grows |
| No deployment / CI / hosting config | ✅ Confirmed | No `.github/`, Dockerfile or compose file |
| CGDA hallucination filter is a no-op stub | ✅ Confirmed | `cgda.js:122-147`: `parseJsx`, `buildWhitelist`, `filterTree` are stubs |
| A corrected parser-based CGDA may be in progress | ❌ Not present | Single commit, clean tree |
| `ui_plan.test.js` is a copy of its own source | ❌ **False** | Real test: builds plans and throws on 6+ conditions; **passes** |
| `test_canonical_reconciliation.py` is a copy of `schema_prompt.py` | ❌ **False** | Real asserts on bounds normalisation and dedupe; **passes** |
| `cgda.test.js` asserts behaviour the stub lacks | ✅ Confirmed | 4 pass, **8 fail** |
| `services/common/roles.{js,py}` recently added | ❌ **Absent** | Directory does not exist |
| 3 root patch scripts apply edits by string replacement | ✅ Confirmed, with nuance | `style_patch.py` is **already applied** (32 `var(--wf-text)` hits). `fix_schema.py` and `fix_template_split.py` are **NOT applied** (0 matches), so they hold pending, unreviewed behaviour changes |
| server.js: open CORS, Multer 1.x, no auth/rate limit, unbounded spawn/Map, 422-for-everything | ✅ Confirmed | `server.js:20,64,71-99,24,137`. Default error status is 422; malformed JSON → 400 from express.json |
| Hardened server.js may exist | ❌ Not present | |
| LivePreview runs JSX via `new Function()` with unpinned CDN Babel, no SRI/CSP | ⚠️ Mostly | `new Function` ✅, no SRI ✅, no CSP ✅. Babel **is version-pinned** (`@babel/standalone@7.25.6`) |
| schema.js / ui_plan.js contain 400+ line god functions | ⚠️ Substance confirmed, numbers off | `schema.js` is 141 lines but **minified-style** (lines up to 1,712 chars), and one `buildSchema` mutates a shared node set. `ui_plan.js` is 840 lines with 21 functions; `pageFamilyHypotheses` and `applyAuthModel` hardcode families |
| Page-family logic duplicated across 3+ files | ✅ Confirmed | `schema.js:39,78-100,133`, `ui_plan.js:560-700`, `ocr_layout_fusion.py:34-147`, `canonical_reconciliation.py:62-65` |
| README claims 169/169 tests, Download button, `GET /api/job/:id/download` | ✅ All false | README lines 13, 122, 151, 346, 512. No download route; `backend/project_export.js` is orphaned (nothing requires it) |
| Multer 1.x has CVEs | ⚠️ Partly verified | `npm audit` did **not** flag multer 1.4.5-lts.2. It is EOL/deprecated upstream. Re-check against the multer <2.0 advisories during the upgrade |

### Test-reality table (every executed test file)

Each file was run individually with the `.venv` Python / Node 22. "Asserts" counts lines that match `assert|throw new Error|expect(`.

| File | Real assertions? | Runs? | Result | Asserted behaviour matches code? |
|---|---|---|---|---|
| backend/generated_jsx_gate.test.js | Yes (2) | Yes | PASS | Yes |
| backend/python_resolver.test.js | Yes | Yes | 7/7 | Yes |
| backend/subprocess_transport.test.js | Yes | Yes | PASS | Yes |
| backend/e2e_transport.test.js | Yes (7) | Only with a running server + image arg | **PASS ×4** against live server | Yes, but weak: never checks validity |
| services/cgda/cgda.test.js | Yes (32) | Yes | **4/12** | **No.** Stub lacks parser/whitelist |
| services/validation/validate.test.js | Yes (23) | Yes | **1/7** | **No.** Depends on stub `parseJsx` |
| services/validation/fidelity.test.js | Yes | Yes | 5/5 | Yes |
| services/schema/schema.test.js | Yes | Yes | 9/9 | Yes |
| services/schema/product_layout.test.js | Yes | Yes | 1/1 | Yes |
| services/semantic/ui_plan.test.js | Yes (throws) | Yes | PASS | Yes (brief's "copy of source" claim is false) |
| services/codegen/test_template_compiler.py | Yes (52) | Yes | 34/34 | Yes |
| services/codegen/test_instruction_parser.py | Yes | Yes | 28/28 | Yes |
| services/codegen/test_generate.py | Yes | Yes | 6/6 | Yes |
| services/codegen/product_layout.test.py | Yes (3) | Yes | **FAIL** (`"Product image"` missing) | **No.** Compiler output drifted |
| services/detection/test_detect.py | Yes | Yes | 4/4 | Yes |
| services/detection/test_heuristic_detector.py | Yes | Yes | **6/11** | **No.** Buttons, dedupe and empty-canvas behaviour regressed |
| services/detection/test_ocr_extractor.py | Yes | Yes | 11/11 | Yes |
| services/detection/test_ocr_layout_fusion.py | Yes | Yes | PASS | Yes |
| services/detection/test_ocr_runtime.py | Yes | Yes | PASS | Yes |
| services/detection/test_roi_recovery.py | Yes | Yes | PASS | Yes |
| services/preprocessing/tests/test_preprocess.py | Yes | **No** (`pytest` missing) | Standalone runner: **5/8** | **No.** Shape/scale expectations drifted |
| services/rag/test_retrieve.py | Yes | Yes | **4/8** | **No.** Expects 20 templates; `describe_schema_node` format changed |
| services/vision/test_canonical_reconciliation.py | Yes | Yes | PASS | Yes (brief's "copy" claim is false) |
| services/vision/test_gemini_schema_adapter.py | Yes | Yes | PASS | Yes |
| services/vision/test_provider.py | Yes | Yes | PASS | Yes |
| scripts/test_fixture_file_runner.py | Yes | Yes | PASS | Yes |
| scripts/test_fixture_ocr_regression.py | Yes | Yes | PASS | Yes |
| scripts/test_e2e_integration.py | Yes | **Broken harness** | 0/4 | Unknown. Hardcodes `python3` (resolves to a Python without cv2) |
| scripts/test_instructions_integration.py | Yes | **Broken harness** | 0/7 | Unknown. Same `python3` problem |
| scripts/test_backend_edge_cases.py | Yes | **Broken harness** | 2/11 | Unknown. Hardcodes `python3` and `/tmp` |
| scripts/test_realistic_wireframes.py | Yes | **Broken harness** | crash | Unknown. Hardcodes `/tmp` |
| scripts/test_frontend_slow_response.py | Yes | **SKIP** (playwright missing) | exit 0 | Not exercised. Exit 0 on skip hides that it never ran |
| frontend/scripts/verify_ui_contract.cjs | String-presence checks only | Yes | PASS | Weak: substring checks, not behaviour |
| frontend/scripts/verify_preview_transform.mjs | Yes | Yes | PASS | Yes |

**Summary.** No file is a zero-assertion fake. The real problems are:
- **5 suites assert behaviour the code no longer has:** cgda, validate, heuristic detector, rag, and product_layout.py.
- **5 harnesses can't run on this machine:** they hardcode `python3`/`/tmp`, need pytest, or need playwright.
- **There is no test runner and no CI**, so nothing ever ran all of these together.

**Build/other checks**
- `vite build`: ✅ 161 KB JS (52 KB gzip), 94 KB CSS.
- `npm audit`, backend prod deps: **4 vulnerabilities (1 critical: `proxy-addr` IP spoofing; 3 moderate: `qs` DoS via express/body-parser)**.
- `npm audit`, frontend (dev deps): high/moderate in `vite`, `esbuild`, `braces`/`micromatch` (via tailwind), `postcss-selector-parser`, `source-map-js`.

### docs/ inventory

60 Markdown files in `docs/` plus 35 in `services/fixtures/reports/`. Classified by filename and spot-check, not read in full:

- **Genuine guides / plans (6):** `dataset-download-guide`, `dataset-readiness-plan`, `gemini-rate-limit-fallback-runbook`, `production-ready-roadmap`, `project-architecture-audit`, `review1-demo-script`.
- **Per-run forensic or agent reports (~54):** `codex-*`, `devin-*`, `antigravity-*`, `gemini-*-diagnosis`, `ecommerce-*-after/baseline`, `landing-*`, `final-*`, `review1-*-report`, and others. These are historical artefacts, not specifications. Move them to `docs/archive/` (or gitignore future per-run output). `services/fixtures/outputs/**` (~400 generated PNG/JSON files) is also tracked.

---

## 4. Additional defects found beyond the brief

| ID | Defect | Evidence |
|---|---|---|
| X1 | Validation always reports 0% structural accuracy and burns 3 regenerations per job | Job `404a3ef2…`: `attempts:3, structuralAccuracy:0` |
| X2 | Runtime writes into the git-tracked RAG catalog on every generate | `cli_pipeline.py:349` → `retrieve.py:23-31`; observed `M services/rag/vectors.sqlite3` |
| X3 | Uploads and runtime dirs never cleaned (disk exhaustion) | `server.js:22,27,84-88` |
| X4 | Unauthenticated `/api/vision/smoke-test` and `/api/vision/gemini/models` can trigger paid provider calls (cost abuse) | `server.js:131-132` |
| X5 | Vision status is process-global and mislabels "disabled" as "provider-error" | `server.js:44,104`; observed |
| X6 | Backend imports Babel from `frontend/node_modules` | `server.js:48` |
| X7 | Python error text (stderr) is returned to clients verbatim | `server.js:77,95,137` |
| X8 | Upload accepts any bytes with an image extension; MIME/magic-byte check is deferred | Observed with a text-as-.png file |
| X9 | 10 "force restart" comments appended to server.js | `server.js:141-159` |
| X10 | Test harnesses hardcode `python3` and `/tmp` (non-portable; fail on Windows) | `scripts/test_*.py` |
| X11 | Frontend: 6 sequential requests with no timeout, no cancel, no request dedup; jobs not resumable after reload | `App.jsx:28` |
| X12 | Generated code's `useState` comes from the host React instance in the preview, so a crash in generated code shares the app's React tree | `previewTransform.js:8-9` |

---

## 5. Feature scorecard

Weights: functional correctness 20%, security 15%, UI/UX + a11y 15%, architecture 15%, performance 10%, reliability 10%, testing 10%, ops 5%. Weights are re-normalised over applicable dimensions ("n/a").

**Security gate:** any feature with security ≤ 2 is a **release blocker regardless of its overall score.**

| Feature | Score | FC | Sec | UX | Arch | Perf | Rel | Test | Ops | Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| Upload & input validation | **4.8** | 6 | 3 | 6 | 5 | 6 | 4 | 3 | 3 | |
| Preprocessing | **6.2** | 7 | 6 | n/a | 7 | 6 | 6 | 5 | 4 | |
| UI detection (classical CV) | **5.0** | 5 | 6 | n/a | 5 | 5 | 5 | 4 | 4 | |
| OCR + layout fusion | **5.7** | 6 | 6 | n/a | 5 | 5 | 6 | 7 | 4 | |
| Vision provider (optional) | **5.5** | 6 | 4 | n/a | 6 | 5 | 6 | 6 | 5 | |
| Schema builder | **4.9** | 6 | n/a | n/a | 2 | 6 | 5 | 6 | n/a | |
| Semantic UI plan | **5.0** | 6 | n/a | n/a | 3 | 6 | 5 | 5 | n/a | |
| RAG retrieval | **4.5** | 5 | 5 | n/a | 5 | 5 | 3 | 4 | 3 | |
| Code generation (template compiler) | **6.2** | 7 | 6 | n/a | 5 | 6 | 6 | 7 | n/a | |
| CGDA hallucination filter | **1.6** | 1 | 1 | n/a | 3 | n/a | 2 | 1 | n/a | 🚫 |
| Validation & retry loop | **2.4** | 1 | 4 | n/a | 4 | 1 | 2 | 2 | n/a | 🚫 (functional) |
| Fidelity evaluation | **6.3** | 6 | n/a | n/a | 6 | 7 | 6 | 7 | n/a | |
| Live preview | **4.9** | 7 | 1 | 6 | 5 | 5 | 6 | 4 | 3 | 🚫 |
| Frontend workspace UI | **4.5** | 6 | 4 | 5 | 3 | 6 | 5 | 2 | 4 | |
| Export / download | **0.5** | 0 | n/a | 0 | 2 | n/a | n/a | 0 | n/a | 🚫 (claimed, absent) |
| Backend API & job orchestration | **3.4** | 6 | 1 | n/a | 3 | 4 | 2 | 4 | 2 | 🚫 |
| **Authentication & authorization** | **0.0** | 0 | 0 | 0 | 0 | n/a | 0 | 0 | 0 | 🚫 owner mandate |
| **Persistent data layer** | **0.5** | 1 | 0 | n/a | 1 | n/a | 0 | 0 | 0 | 🚫 owner mandate |
| Test & QA infrastructure | **2.8** | 3 | n/a | n/a | 3 | n/a | 3 | 3 | 1 | |
| Documentation / README accuracy | **2.4** | 2 | n/a | 3 | 2 | n/a | n/a | n/a | 3 | |
| Deployment, CI & operations | **0.9** | 1 | 1 | n/a | 1 | n/a | 1 | 0 | 1 | 🚫 |

### Per-feature detail

Effort is labelled **S** (≤ ½ day), **M** (1–3 days) or **L** (> 3 days). These are engineering estimates, not measurements.

**Authentication & authorization — 0.0 · Absent · P0**
- *Evidence:* no user model, session, cookie, token or middleware anywhere. `GET /api/job/:id` returns any job to anyone.
- *User impact:* no ownership, so any leaked job ID exposes another user's wireframe-derived code.
- *Fix:* self-hosted sessions (Argon2id + DB-backed opaque session tokens in an httpOnly cookie) or a managed provider (see roadmap decision D1). Add `requireAuth` plus `requireJobOwner` middleware on every `/api/*` route except health. Add CSRF tokens (double-submit or `Origin` check), rate limiting on auth routes, lockout/backoff, and non-disclosing errors.
- *Files:* backend (new `auth/`, `db/`, middleware), frontend (auth screens, route guard, `credentials: 'include'`).
- *Effort:* L.
- *Acceptance:* integration tests prove 401 unauthenticated, 401 expired, 404 for cross-user job access, logout invalidates the session server-side, and no route is reachable without a session.

**Persistent data layer — 0.5 · Absent · P0**
- *Evidence:* `server.js:24`. The only SQLite file is the RAG catalog.
- *Fix:* app DB with `users`, `sessions`, `projects`, `jobs`, `artifacts`, `auth_tokens` (verify/reset). Versioned SQL migrations with an up/down runner; stage results stored per job; TTL cleanup of temp files.
- *Effort:* L.
- *Acceptance:* a job survives a server restart; a migration up→down→up round-trips on a scratch DB; ownership columns are indexed.

**CGDA — 1.6 · Broken (no-op) · P0**
- *Evidence:* `cgda.js:122-147`; 8/12 tests fail.
- *Fix:* the codegen path emits a typed AST (`runCgda` receives an AST *or* a string). Implement a real filter on the AST: whitelist by schema node types (`TYPE_TO_ALLOWED_TAGS`), strip unaccounted subtrees, report `stripped[]`, and compute `hallucinationRate = stripped / total`. For string input (LLM mode), parse with `@babel/parser` (already present transitively), filter the JSX AST, and regenerate with `@babel/generator`. Never hand-roll a regex parser.
- *Effort:* M.
- *Acceptance:* the existing `cgda.test.js` cases pass unchanged (canvas stripped, nested wrapper stripped, text preserved, boilerplate preserved).

**Validation & retry — 2.4 · Broken · P0 (functional)**
- *Evidence:* every job reports `structuralAccuracy: 0` and 3 regenerations.
- *Fix:* depends on real `parseJsx` from CGDA. Short-circuit regeneration in template mode, since a deterministic compiler regenerates identical output and retries are pointless.
- *Effort:* S once CGDA is fixed.
- *Acceptance:* `validate.test.js` 7/7, and a fixture job reports accuracy > 0 with `attempts` 0 in template mode.

**Live preview — 4.9 (security 1) · Unsafe · P0**
- *Fix:* render in an `<iframe sandbox="allow-scripts">` (no `allow-same-origin`) built from a `srcdoc` with its own CSP. Self-host Babel standalone (vendored, with integrity hash) or precompile on the server. Use `postMessage` for diagnostics, a hard timeout plus iframe teardown for runaway code, and drop the host-React injection.
- *Effort:* M.
- *Acceptance:* generated code calling `parent.document`, `fetch`, or reading `document.cookie` cannot reach the app origin (test with a malicious fixture); an infinite loop in generated code doesn't freeze the main UI.

**Backend API & orchestration — 3.4 · Works, insecure · P0/P1**
- *Fix:*
  - CORS allowlist from env; `helmet`; drop `x-powered-by`.
  - `express-rate-limit`; a concurrency-limited job queue (semaphore around `execFile`, with timeout and kill).
  - Typed error classes mapped to 400/401/403/404/409/413/422/500, with internal stderr logged and never returned.
  - Upgrade to Multer 2.x with magic-byte sniffing at upload.
  - Split `server.js` into routes/services; vendor `@babel/parser` as a backend dependency.
- *Effort:* M.
- *Acceptance:* no `*` CORS; 6th concurrent heavy job queues rather than spawning; error bodies contain no stack/stderr.

**Export / download — 0.5 · Claimed, absent · P1**
- *Fix:* either implement `GET /api/projects/:id/jobs/:jobId/export` (owner-checked, using the existing `project_export.js` zip builder plus tests) or delete the README claims and the orphan file. **Recommendation: implement.** It's small and the README promises it.
- *Effort:* S.

**Schema builder — 4.9 / Semantic UI plan — 5.0 · Works, unmaintainable · P1**
- *Fix:* un-minify; split `buildSchema` into named passes (`normalize → macroZones → parentAssign → familyRepair → layoutInfer → finalize`); move page-family scoring and rules into one module (`services/common/page_family.{js,py}`) plus a shared role vocabulary (`services/common/roles.{js,py}`).
- *Prerequisite:* golden-file snapshot tests over `services/fixtures/outputs/*/schema.json` before refactoring.
- *Effort:* L.

**RAG — 4.5 · Works, writes to tracked file · P1**
- *Fix:* open the catalog read-only at runtime (`file:...?mode=ro`); build/upsert only via an explicit ingest command; update `test_retrieve.py` to the current catalog size and description format.
- *Effort:* S.

**Upload — 4.8 · P1**
- *Fix:* magic-byte check (PNG/JPEG/WEBP/BMP) at upload; per-user quota; delete source files when a job expires or is deleted.
- *Effort:* S.

**Frontend workspace UI — 4.5 · P1/P2**
- *Fix:* restyle per the design system; un-minify App into components; add a cancel/abort controller, per-stage timeouts and resumable jobs (from the DB); add an empty/history view.
- *Effort:* L.

**Test & QA infrastructure — 2.8 · P1**
- *Fix:*
  - Single `npm test` / `pytest` entry points.
  - Replace `python3`/`/tmp` with `sys.executable`/`tempfile`; add pytest to requirements.
  - Make a skipped test exit non-zero in CI unless explicitly allowed.
  - Add a zero-assertion lint gate.
  - Repair the 5 drifted suites: fix the code where the test is right (CGDA, validate), and update the test only where the code change was intentional (RAG count, detector heuristics), with justification recorded.
- *Effort:* M.

**Docs — 2.4 · P1**
- *Fix:* rewrite the README against verified reality; archive the ~54 per-run reports.
- *Effort:* S.

**Deployment/CI/ops — 0.9 · P0 for release**
- *Fix:* Dockerfile (Node + Python + Tesseract in one image), GitHub Actions (lint, test, build, audit), env validation at boot, `/healthz` vs `/readyz`, structured JSON logs, graceful shutdown that waits for in-flight subprocesses.
- *Effort:* M.

The remaining features (preprocessing, detection, OCR, vision, codegen, fidelity) work and need targeted fixes listed in the roadmap rather than redesign.

---

## 6. Top-5 highest-impact improvements

1. **Auth + ownership + persistent DB** (Mandates A+B). This unlocks multi-user use at all.
2. **Real CGDA parser → working validation.** Fixes a false safety claim, makes the "valid" flag meaningful, and removes 3 wasted regenerations per job.
3. **Sandboxed preview** (iframe + CSP + self-hosted Babel). Prevents generated code from touching the authenticated app.
4. **Backend hardening:** CORS allowlist, rate limits, job concurrency queue, typed errors, Multer 2, upload sniffing, temp-file TTL.
5. **One trustworthy test command + CI**, with the drifted suites repaired.

**Quick wins (S):**
- Remove `X-Powered-By` and the force-restart comments.
- Fix the vision status mapping.
- Make RAG read-only at runtime.
- Use `sys.executable`/`tempfile` in the harnesses.
- `npm audit fix` for `qs`/`proxy-addr`.
- Correct the README.
- Add export (the zip builder already exists).

**Major work (L):** auth, DB, design-system restyle, schema/ui_plan decomposition, deployment.

## 7. Capabilities required for a credible production release

- Authentication: register, login, logout, session expiry, password reset, email verification (or a documented deferral if there's no mail provider).
- Per-user authorization on every data route.
- Persistent DB with migrations, backups and a retention policy.
- Sandboxed preview with CSP.
- Working CGDA and validation.
- Rate limits, quotas and job concurrency control.
- CI running all tests, build and dependency audit.
- Container build, health checks, structured logs, graceful shutdown.
- An accurate README and operational runbook.
