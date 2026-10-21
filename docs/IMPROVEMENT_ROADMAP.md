# Improvement Roadmap

Derived from [PROJECT_AUDIT.md](PROJECT_AUDIT.md) (2026-10-19). Every item has acceptance criteria and a verification method. Effort labels (S ≤ ½ day, M 1–3 days, L > 3 days) are estimates, not measurements.

---

## Decisions needed before Stage 4

### D1 — Auth provider + free-tier database (Mandates A + B)

| Option | Cost at small scale | Fits Express + Python? | Offline / deterministic dev? | Auth included? | Main risks |
|---|---|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | Free tier; projects pause after inactivity | Yes (JS SDK in Express; Python only needs no DB access) | **No.** Every login and DB call needs the internet and a Supabase project | Yes, with email verification and reset built in | Vendor coupling; breaks the repo's "fully offline" default; needs the owner to create a project and hold keys |
| **Neon** (serverless Postgres) | Free tier, scale-to-zero | Yes | No | No (still need self-hosted auth) | Two moving parts for no gain over Supabase |
| **Turso / libSQL** | Free tier | Yes, via `@libsql/client` | **Yes:** the same client opens a local `file:` DB | No | Smaller ecosystem |
| **Local SQLite** (`better-sqlite3`) | $0 forever | Yes | Yes | No | Single node; needs a persistent disk in production |

**Recommendation: self-hosted auth on libSQL/SQLite.**
- **Database:** `@libsql/client` behind a small repository layer.
  - Dev and tests use a local `file:data/app.db`, so the project stays offline and deterministic.
  - Production points `DATABASE_URL` at a Turso free-tier database (no persistent disk required), or at a local file on a single container with a volume.
  - Switching is a config change, not a code change.
- **Auth:** Argon2id (`@node-rs/argon2`) plus opaque, DB-backed session tokens.
  - The token is stored hashed (SHA-256), and the cookie is `httpOnly`, `Secure`, `SameSite=Lax`.
  - Sliding expiry with an absolute cap. Logout deletes the row.
  - CSRF defence: an `Origin`/`Sec-Fetch-Site` check plus a double-submit token on mutating routes.
  - This is the pattern Lucia documents; the Lucia *library* itself was deprecated in 2025, so the pattern is implemented directly, with no hand-rolled crypto.
- **Email verification and password reset:**
  - Single-use, hashed, expiring tokens.
  - A pluggable mailer: in dev it logs the link to the server console; in prod it uses SMTP via env (any free SMTP tier). Until SMTP is configured, verification is *recorded but not enforced*. That is a documented, explicit flag, not a silent gap.
- **Why not Supabase as the default:** it is the strongest *managed* option. But it would make an internet connection and an external account mandatory for a product whose current default is fully offline, and it needs credentials only the owner can create. The repository layer keeps a later move to Postgres/Supabase possible.

> **Approval needed:** confirm this choice, or choose Supabase. If you choose Supabase, I need you to create the project and put its URL and keys in `.env` yourself. I won't create external accounts.

### D2 — Pending patch scripts

`style_patch.py` is already applied, so it can simply be deleted. `fix_schema.py` (widen feature-card detection to `card`/`region` types) and `fix_template_split.py` (split-layout two-column grouping) were **never applied**. Plan:
1. Apply each change.
2. Run the schema and compiler suites plus fixture snapshots.
3. Keep the change only if nothing regresses, then delete the script either way.

The result is recorded in IMPLEMENTATION_STATUS.

### D3 — Gemini key in `.env`

Vision is enabled locally with a real key. Recommendation: keep `VISION_ENABLED=false` as the default in `.env.example` and in tests, require explicit opt-in per deployment, and put the provider endpoints behind auth plus a per-user quota.

---

## Prioritised backlog

### P0 — security, data loss, broken core, production blockers

| # | Item | Effort | Acceptance criteria | Verify by |
|---|---|---|---|---|
| P0-1 | App DB + migrations (users, sessions, projects, jobs, artifacts, auth_tokens); repository layer; replace the jobs `Map` | L | Job survives restart; migration up/down/up on scratch DB; FK + ownership indexes | Integration test + migration test |
| P0-2 | Auth: register/login/logout/me, Argon2id, DB sessions, expiry/renewal, verify + reset tokens, rate-limit and backoff on auth routes, generic error messages | L | 401 unauthenticated; 401 after expiry; logout invalidates server-side; 429 after N failed logins; wrong-password and unknown-user responses identical | `node --test` integration suite |
| P0-3 | Authorization: `requireAuth` on all `/api/*` except health; owner check on every job/project/artifact read and write; projects scoped per user | M | Cross-user access → 404; no route returns another user's data; tampering with `userId` in the body is ignored | BOLA test matrix over every route |
| P0-4 | CSRF (Origin check + double-submit token), CORS allowlist from env, `helmet` headers, no `x-powered-by` | S | Cross-origin POST rejected; CORS `*` gone; CSP and HSTS headers present in prod mode | Integration tests on headers |
| P0-5 | Real CGDA: AST whitelist filter for template mode; Babel-parser filter for string/LLM mode | M | `cgda.test.js` 12/12 without weakening assertions | Unit tests |
| P0-6 | Validation fixed on real `parseJsx`; skip regeneration in deterministic template mode | S | `validate.test.js` 7/7; fixture job reports accuracy > 0 and `attempts` 0 | Unit + fixture run |
| P0-7 | Sandboxed preview: `iframe sandbox="allow-scripts"` (no same-origin), CSP in `srcdoc`, vendored Babel with integrity hash, postMessage diagnostics, watchdog timeout | M | Malicious fixture can't read parent DOM, cookies or storage; infinite loop doesn't freeze the app | Playwright test with hostile fixture |
| P0-8 | Job execution guard: concurrency semaphore, per-subprocess timeout + kill, per-user quota | S | N+1th job queues; a hung Python process is killed at the timeout | Unit test with a fake slow CLI |
| P0-9 | Protect `/api/vision/*` (auth + quota); stop returning raw stderr | S | Anonymous call → 401; error bodies contain no paths or stack traces | Integration test |
| P0-10 | Dependency CVEs: `npm audit fix` (qs, proxy-addr); Multer → 2.x; Vite → patched line | S | `npm audit --omit=dev` clean (or documented exceptions) | CI step |

### P1 — important functional, architectural, reliability issues

| # | Item | Effort | Acceptance |
|---|---|---|---|
| P1-1 | Upload: magic-byte sniffing, size limit, per-user storage, TTL cleanup of uploads and runtime dirs, delete on job/project delete | S | Text-as-.png rejected at upload; temp dirs removed after job completion/expiry |
| P1-2 | Export: owner-checked zip download using `project_export.js` (plus tests) | S | Downloaded zip unpacks and `npm run build` succeeds on it |
| P1-3 | RAG catalog read-only at runtime; ingest is an explicit command; fix `test_retrieve.py` drift | S | Pipeline run leaves `git status` clean; 8/8 |
| P1-4 | Test infra: one `npm test` + `pytest`; `sys.executable`/`tempfile` in harnesses; pytest in requirements; zero-assertion lint gate; skipped tests fail CI unless allow-listed | M | All suites run from one command on Windows and Linux |
| P1-5 | Repair drifted suites (heuristic detector 5, preprocess 3, product_layout.py 1), deciding per case whether the code or the test is wrong, with the reason recorded | M | All green, with no assertion weakened without a written justification |
| P1-6 | `services/common/roles.{js,py}` + `page_family.{js,py}`; route schema.js, ui_plan.js, ocr_layout_fusion.py and canonical_reconciliation.py through them | L | One definition per family; golden-file snapshots unchanged |
| P1-7 | Decompose `buildSchema` / `buildSemanticUiPlan` into named passes (golden snapshots first) | L | Snapshot-identical output; each pass unit-tested |
| P1-8 | Split `server.js` into routes/services/middleware; typed errors; backend owns `@babel/parser` | M | No `require('../frontend/node_modules/...')` |
| P1-9 | Resolve the patch scripts (D2) and delete all three | S | Root has no patch scripts |
| P1-10 | README rewrite; archive ~54 per-run reports to `docs/archive/` | S | Every README claim traceable to code or a test |
| P1-11 | Fix vision status mapping; make vision status per-job, not process-global | S | Disabled vision reports `disabled` |

### P2 — UX, design system, accessibility, performance

| # | Item | Effort |
|---|---|---|
| P2-1 | Design-style decision (Phase 2) + Bento Grid design system, tokens and light/dark themes → `docs/DESIGN_SYSTEM.md` | M |
| P2-2 | Restyle the workspace: project nav, upload, preview with overlays, config, code/preview tabs, validation, export, history (from DB); desktop/tablet/mobile | L |
| P2-3 | Auth screens (login/register/reset/verify) in the same system | M |
| P2-4 | Workflow states: stage progress, cancel (AbortController), timeouts, retry, resume after reload, no infinite spinners | M |
| P2-5 | Accessibility: keyboard paths, focus rings, labels, AA contrast in both themes, reduced motion | M |
| P2-6 | Performance: measure bundle, code-split the preview iframe runtime, virtualise long code views if measurement warrants it | S |

### P3 — polish
Code-view syntax highlighting upgrade, keyboard shortcuts, project rename/duplicate.

### Release ops (alongside P1/P2)
Dockerfile (Node + Python + Tesseract), GitHub Actions (lint, test, build, audit), env validation at boot, `/healthz` + `/readyz`, JSON logs with request IDs, graceful shutdown, backup/restore runbook. Docs: `DEPLOYMENT.md`, `ENVIRONMENT_VARIABLES.md`, `OPERATIONS_RUNBOOK.md`, `SECURITY_REVIEW.md`, `AUTH_AND_DATA_MODEL.md`, `IMPLEMENTATION_STATUS.md`.

---

## Stage plan

| Stage | Contents | Exit criteria |
|---|---|---|
| 1–2 ✅ | Discovery, test-reality audit, scoring | This document + PROJECT_AUDIT.md |
| 3 | Design-style decision + Bento spec | DESIGN_SYSTEM.md approved |
| 4 | P0-1 … P0-10 | All P0 acceptance tests green; SECURITY_REVIEW.md |
| 5 | Pipeline correctness: P1-3, P1-5, P1-6, P1-7, P1-9, export | Golden snapshots stable; all suites green |
| 6 | UI restyle: P2-1 … P2-5 | Playwright e2e register → generate → export → logout |
| 7 | Tests, a11y, performance pass | Reported with real numbers only |
| 8 | Deployment config + docs | Container builds; CI green; no deploy without approval |

**Not done without explicit approval:** creating external accounts (Supabase/Turso/SMTP), public deployment, paid services, destructive migrations on real data, or sending project data to AI providers.
