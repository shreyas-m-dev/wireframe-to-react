# Implementation Status

**Last updated:** 2026-10-19 · **Stages complete:** 1–2 (audit), 3 (design decision), 4 (P0 security and foundations). **Nothing is committed yet.**

## Verified score (same rubric as PROJECT_AUDIT.md)

| Feature | Before | After Stage 4 | Δ |
|---|---|---|---|
| Authentication & authorization | 0.0 | **7.3** | +7.3 |
| Persistent data layer | 0.5 | **7.7** | +7.2 |
| CGDA hallucination filter | 1.6 | **7.6** | +6.1 |
| Export / download | 0.5 | **6.2** | +5.7 |
| Validation & retry loop | 2.4 | **7.1** | +4.7 |
| Backend API & job orchestration | 3.4 | **7.3** | +3.9 |
| Documentation / README accuracy | 2.4 | **5.4** | +3.0 |
| Test & QA infrastructure | 2.8 | **5.8** | +2.9 |
| Upload & input validation | 4.8 | **7.3** | +2.5 |
| Live preview | 4.9 | **7.3** | +2.4 |
| Frontend workspace UI | 4.5 | **6.7** | +2.2 |
| Deployment, CI & operations | 0.9 | **2.9** | +2.1 |
| RAG retrieval | 4.5 | **5.2** | +0.7 |
| Vision provider | 5.5 | **5.8** | +0.4 |
| Preprocessing / Detection / OCR / Schema / Semantic plan / Codegen / Fidelity | 4.9–6.3 | unchanged | 0 |
| **Overall (mean of 21)** | **3.7** | **6.1** | **+2.4** |

**Caps on these scores:**
- Auth scores assume the Supabase integration behaves as tested with locally signed tokens. It drops if live verification (P0-R1) finds a mismatch.
- Not production-ready: deployment/CI is still 2.9, and Supabase has not been verified live.

## P0 items

| # | Item | Status | Evidence |
|---|---|---|---|
| P0-1 | Postgres app DB, migrations, repositories; jobs `Map` removed | ✅ Done | `backend/db/migrations/0001_*`, `src/db/*`; `migrations.test.js` (up→down→up, checksum guard, RLS on, cross-owner FK) |
| P0-2 | Authentication (Supabase): JWT verification, live-session check, sign-up/in/out, verify, reset UI | ✅ Done, ⚠️ not yet run against a live Supabase project | `src/auth/supabase.js`, `frontend/src/auth/*`; `auth.test.js` 10/10 (mutation-checked) |
| P0-3 | Authorization: owner-scoped SQL, 404 for foreign objects, admin allowlist | ✅ Done | `api.test.js` BOLA matrix (mutation-checked) |
| P0-4 | CORS allowlist, helmet headers, no x-powered-by, CSRF analysis | ✅ Done (CSRF N/A: bearer tokens) | `api.test.js` CORS/headers |
| P0-5 | Real CGDA (Babel-parser filter) | ✅ Done | `cgda.test.js` 12/12 (original assertions unchanged), `cgda.fixtures.test.js` (34 real outputs) |
| P0-6 | Validation on real parser; no regeneration in template mode | ✅ Done | `validate.test.js` 7/7; real pipeline: 100% coverage, 0 retries, ~10–20 s per job (was 43–56 s, always 0%) |
| P0-7 | Sandboxed preview (opaque-origin iframe, own CSP, server-compiled JS, no CDN, watchdog) | ✅ Done | `preview-sandbox.e2e.test.js` in real Chrome (render, hostile probe, busy loop; mutation-checked) |
| P0-8 | Job runner: concurrency cap, queue cap, per-stage timeout + kill, cancel, quotas, crash recovery | ✅ Done | `api.test.js` (quota, cancel, recovery), `python_transport.test.js` (timeout kill) |
| P0-9 | Vision endpoints admin-only; no raw stderr to clients | ✅ Done | `auth.test.js`, `api.test.js`, `compile.test.js` |
| P0-10 | Dependency CVEs | ✅ Prod tree: `npm audit --omit=dev` = 0. ⚠️ Dev-only advisories remain (Vite 5, Tailwind 3) | SECURITY_REVIEW R-2 |

**Also done in Stage 4** (pulled forward because P0 work depended on them):
- **Export:** a runnable Vite + Tailwind zip, owner-checked.
- **RAG catalog:** no longer rewritten on every request.
- **Vision status:** a disabled provider is reported as `disabled`.
- **Job status:** reflects verified checks; fidelity is advisory. Previously `complete` was unreachable.
- **Repo structure:** converted to npm workspaces with one lockfile; dead frontend code removed (`LivePreview`, `previewTransform`, `PipelineSchematic`).
- **Tests:** zero-assertion CI gate (`scripts/check_test_assertions.js`) and Python test runner (`scripts/run_python_tests.js`).
- **README:** rewritten.

## Stage 3: design system

✅ `docs/DESIGN_SYSTEM.md`: style comparison, Bento Grid + restrained glass, tokens with computed WCAG contrast, layouts and components. Implemented in `frontend/src/styles/tokens.css`, `tailwind.config.js` and `frontend/src/ui/`.

The workspace runs on the bento grid at desktop, tablet and mobile. These were checked by screenshot in headless Chrome during the e2e harness run; the screenshots are not committed.

## Python test repair (2026-10-21)

All 8 failing Python test files were resolved. For each one, the code was fixed where the test was right, and the test was updated only where an intended code change had made it stale. The reason is recorded in each changed test.

| Failure | Root cause | Fix (code or test) |
|---|---|---|
| `test_backend_edge_cases`, `test_e2e_integration`, `test_instructions_integration`, `test_realistic_wireframes` | Harnesses hard-coded `python3` and `/tmp` and interpolated Windows paths into JS strings | **Test harness:** `sys.executable`, `tempfile`, POSIX paths in `node -e` |
| Blank canvas returned detections; blank upload didn't fail as "nothing found" | Detector always emitted a `page`/`main` skeleton, even with no content | **Code:** no skeleton without an accepted leaf element |
| Outlined ~120×40 buttons labelled `image` or `input` | "Card/media" rule fired at h > 45; input rule fired at aspect > 1.6 | **Code:** card rule needs h > 60, inputs need aspect > 4 |
| X-crossed image placeholder fragmented | Large X-boxes classed as containers; triangle fragments won NMS | **Code:** strict X-glyph check (both diagonals long, crossing near centre) and fragments absorbed before NMS |
| Single centred box got ecommerce gallery/product columns plus an invented media image | Two-column skeleton triggered by ink on both halves | **Code:** requires a real central gutter. Landing page no longer gets product-page regions; ecommerce output unchanged |
| Heading "Join our team today!" split into word nodes | OCR passes emit words as separate lines; header filter dropped punctuated words | **Code:** fragments regrouped into lines by vertical clustering plus word-gap rule; punctuation allowed |
| Header "Login"/"Sign Up" buttons became `<span>` nav text | OCR read borders as text, masking erased them, and outlined boxes matched the text-line rule | **Code:** closed-outline check (only for boxes that contain something); restore labelled controls erased by masking; drop OCR text duplicated inside a labelled control; strip `|` border glyphs from labels |
| Filled "Login" bar labelled `image` | High-fill rule treated a 6:1 strip as a photo | **Code:** filled control-height strips are buttons |
| "GET STARTED" emitted as both input and button | Duplicate evidence | **Code:** a CTA read inside an outlined box makes that box the button |
| Gallery image alt was "Detected visual region" | Compiler lost its role-aware default | **Code:** role-derived accessible name ("Product image") |
| `<img` / `bg-gray-900` assertions | Compiler deliberately renders source-less placeholders as `<div role="img">` and uses a slate dark palette (its own unit test asserts `bg-slate-950`) | **Test:** assertions aligned with intended output |
| `test_retrieve` count and format | Catalog grew to 23 templates; descriptions became layout-aware | **Test:** count derived from `templates.json`, new format asserted. **Code:** trailing space stripped |
| `test_preprocess` | pytest not installed; the old standalone runner misreported | **Tooling:** pytest added to `requirements.txt`; the runner uses `python -m pytest` for pytest-style files, so they can't "pass" by running nothing |
| Element-count caps counted page-skeleton regions | Skeleton is hierarchy, not visible elements | **Test:** count leaf elements only |

**Effect on real fixtures, checked before and after:**
- ecommerce detection: unchanged.
- landing: keeps all 5 images, gains the correct header CONTACT button, and gets one GET STARTED button instead of a duplicate input+button.
- landing no longer gets product-page regions.

**Found by running the app (2026-10-21, local demo):**
- **Contact-form email field stripped by CGDA.** The compiler always synthesises it for a `contact-section`. Previously a bogus "GET STARTED" `input` happened to whitelist the tag. Fix: `contact-section` added to CGDA's role→tag map, and the historical fixture's "known finding" removed. Real landing and ecommerce runs now strip 0.
- **Account menu stayed open.** It ignored Escape unless focused and ignored outside clicks. It now closes on both.
- **Duplicate `id="new-project"`.** The project rail renders as sidebar and drawer. Now uses `useId`.
- **Jobs failed as "server restarted".** On Windows, `node --watch` (even with `--watch-path`) restarted the dev API on unrelated file activity, including every upload written under `data/`. Each restart killed the running job. `npm run dev -w backend` no longer auto-restarts; `dev:watch` remains as an opt-in. Verified: uploads and `.env`/`node_modules` touches no longer restart the server, and the user's image completes in about 9 s.
- **Preview crashed with "formData is not defined".** Every plain `<input>` binds to `formData`, but the compiler declared that state only for form/contact-section roles. Now state is declared from the identifiers the rendered code actually uses (regression test in `test_template_compiler.py`). Validation also gained a scope check (`findUndeclaredIdentifiers`), so code that parses but would crash on render now fails validation with the missing names instead of reaching the preview. Verified on the user's failing image: the run completes and the preview renders in Chrome.
- **Sign-up errors** now show Supabase's specific reason. A "Resend confirmation email" page was added.
- **Empty-state copy** pointed at "the panel on the left", which is wrong on narrow screens.

## Test results (run 2026-10-21, this machine: Windows 11, Node 22.20, Python 3.11.5 venv)

| Suite | Command | Result |
|---|---|---|
| Assertion gate | `node scripts/check_test_assertions.js` | PASS (37 files) |
| Services (JS) | `npm test -w services` | 7/7 files pass |
| Backend | `npm test -w backend` | 40/40 pass (includes real-Python transport, timeout and full-pipeline tests) |
| Frontend | `npm test -w frontend` | 10/10 pass (unit + 2 real-Chrome e2e files). One earlier full run timed out the workspace e2e at 254 s while the machine was busy; two later runs passed in under 45 s. The test now reports the job's terminal state if it fails |
| Python | `npm run test:py` | **21/21 files pass** |
| Frontend build | `npm run build` | PASS: JS 419 KB (121 KB gzip), CSS 27 KB, preview frame 510 KB (79 KB gzip) |
| Audit (prod) | `npm audit --omit=dev` | 0 vulnerabilities |

No type-check exists (the project is JavaScript). There is no linter configured yet, so no lint result to report.

## Not done / next

| Stage | Item | Notes |
|---|---|---|
| **Owner action** | Create the Supabase project, fill `.env`, run `npm run migrate`, then smoke test live | AUTH_AND_DATA_MODEL §7; `scripts/smoke_api.js` |
| Owner action | Decide on `VISION_ENABLED=true` in local `.env` (sends images to Gemini) | SECURITY_REVIEW R-9 |
| 5 | Resolve the patch scripts (`fix_schema.py` and `fix_template_split.py` are unapplied); `roles`/`page_family` modules; decompose `buildSchema`/`buildSemanticUiPlan` behind golden snapshots; RAG read-only open; retention sweep | P1 |
| 6 | Workspace polish: history and empty-state refinements; automated a11y audit (axe); light-theme review of every state | P2 |
| 7 | Vite 8 / Tailwind 4 upgrades (clears dev advisories); bundle split (Supabase SDK chunk); Lighthouse on a deployed build | P2 |
| 8 | Dockerfile (Node + Python + Tesseract), GitHub Actions, DEPLOYMENT.md, OPERATIONS_RUNBOOK.md (backup/restore), Supabase Storage for images, Postgres-backed queue if multi-instance | Release |
| — | Archive the ~54 per-run reports in `docs/` | P1-10 |
