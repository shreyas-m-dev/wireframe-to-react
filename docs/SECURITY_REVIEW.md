# Security Review

**Scope:** the state after Stage 4 (2026-10-19). Threat-oriented: for each threat, the control in place, how it is verified, and what remains. "Verified" means an automated test in this repo exercises it; the test file is named.

## 1. Threat model summary

- **Assets:** user accounts and sessions; uploaded wireframes; generated code; provider API keys (Gemini/OpenAI); the database; server compute (Python CV/OCR is expensive).
- **Adversaries:** anonymous internet clients; authenticated users attacking other users; malicious generated code (LLM mode, or a crafted wireframe/instruction steering the generator); cost attackers.

## 2. Controls

| # | Threat | Control | Verified by |
|---|---|---|---|
| S1 | Unauthenticated access | `requireAuth` on all `/api/*` except health/ready | `backend/test/auth.test.js`: all 19 protected routes return 401 without a token |
| S2 | Forged or mis-scoped tokens | `jose` verification: JWKS/HS256, `iss`, `aud`, `exp`, `role=authenticated`, not anonymous, UUID `sub` and `session_id`; algorithm allowlist | auth.test.js: unknown key, wrong iss/aud, service_role, anon, anonymous user, non-UUID sub, **HS256 confusion**, **alg=none** → 401 |
| S3 | Expired, revoked or banned sessions | Session check against `auth.sessions`/`auth.users` (confirmed, not banned, not deleted) | auth.test.js: expired → `session_expired`; deleted session → `session_revoked`; banned, unconfirmed and deleted users → 401 |
| S4 | Broken object-level authorization (BOLA/IDOR) | Owner-scoped SQL in every repository call; composite FKs | `backend/test/api.test.js`: 11 cross-user routes + foreign upload → 404, victim data unchanged; `migrations.test.js`: FK rejects a cross-owner job. A mutation test confirmed the BOLA test fails when the owner filter is removed |
| S5 | Privilege escalation | Admin only via `ADMIN_USER_IDS`; token metadata ignored; body owner fields ignored | auth.test.js (403 for users, including tokens claiming `app_metadata.role=admin`); api.test.js (body `owner_id` ignored) |
| S6 | XSS / code execution from generated code | Generated code is compiled on the server and evaluated **only** in `<iframe sandbox="allow-scripts">` (opaque origin) whose CSP is `default-src 'none'; connect-src 'none'; form-action 'none'; img-src data: blob:`. There is no Babel or `new Function` in the app origin; Babel CDN removed | `frontend/test/preview-sandbox.e2e.test.js` (real Chrome): hostile code reads of parent DOM, parent storage, own storage and cookies are all blocked; fetch and image beacons are blocked (zero hits reach the server). A mutation test without `sandbox` leaks the parent DOM |
| S7 | Runaway generated code | Heartbeat watchdog removes the frame; the frame runs off the parent's thread in Chromium | e2e: a 2.5 s busy loop leaves parent timer drift under 1 s. Same-thread browsers still freeze; see R-5 |
| S8 | CSRF | Not applicable: bearer tokens only, no auth cookies, CORS `credentials: false` | api.test.js preflight: no `Access-Control-Allow-Credentials` |
| S9 | CORS abuse | Allowlist from `CORS_ORIGINS`, required in production | api.test.js: foreign origin gets no ACAO header |
| S10 | Unsafe uploads | Magic-byte sniffing (PNG/JPEG/WebP/BMP); size, file and part limits (Multer 2); server-generated storage paths; basename sanitising; files 0600 under `DATA_DIR`; path-escape guard | api.test.js: text-as-.png → 415, HTML-as-.jpg → 415, oversize → 413, `../../etc/passwd.png` stored as `passwd.png` |
| S11 | Path traversal via ids | UUID validation before SQL; blob paths resolved inside the upload root only | api.test.js: traversal-looking ids → 404 |
| S12 | Injection (SQL / command) | Parameterised SQL only; `execFile` without a shell; argv length guard; large payloads via files | api.test.js (`' or '1'='1` id → 404); compile.test.js (argv guard) |
| S13 | Secret leakage to the Python worker | Allow-listed child environment: `DATABASE_URL`, `SUPABASE_*` never reach Python | compile.test.js |
| S14 | Secret leakage to clients and logs | Generic 500s with request id; Python stderr classified into safe messages; key-shaped strings redacted; logger scrubs secret-named fields; no stack traces in responses | api.test.js (500 hides `db.internal:5432` detail, which is logged server-side); compile.test.js (no paths or tracebacks in user messages) |
| S15 | Secrets in the frontend bundle | Only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (public by design); the app refuses to start with a service-role/secret key | Build output grep (no `DATABASE_URL`, `GEMINI_API`, or service-role keys) |
| S16 | Brute-force / credential stuffing | Supabase Auth rate limits (configurable, with optional CAPTCHA); generic sign-in errors | Owner must review Supabase settings (AUTH_AND_DATA_MODEL §7) |
| S17 | API abuse / DoS | Per-IP limiter (300/min) before token work; per-user limiter (240/min); job creation (10/min per user); DB-backed quotas (active jobs per user, jobs per hour); global concurrency semaphore plus queue cap (503); per-stage timeout with SIGKILL; 32 KB JSON limit; request and header timeouts | api.test.js: 11th create → 429; active-job quota → 429 with Retry-After; python_transport.test.js: timeout kills the stage |
| S18 | Provider cost abuse (vision/LLM) | Vision off by default; `/api/vision/*` admin-only and rate-limited | auth.test.js |
| S19 | SSRF | No user-controlled URL fetching exists; provider URLs are fixed constants plus env-configured model names | Code review (`services/vision/provider.py`, `codegen/generate.py`) |
| S20 | Security headers | API: CSP `default-src 'none'`, nosniff, frame-ancestors none, no `X-Powered-By`, Referrer-Policy. SPA (when served by Express): strict CSP, HSTS in production, frame-ancestors none | api.test.js (API headers). SPA headers are configured in `backend/src/app.js` but not covered by a test yet |
| S21 | Data retention and deletion | Deleting a project or job removes DB rows (cascade) and stored images; deleting a Supabase user cascades all app rows | api.test.js (project delete removes rows and files) |
| S22 | Dependency CVEs | Multer 1.x → 2.4.0; express/qs/proxy-addr patched; React Router dropped | `npm audit --omit=dev`: **0 vulnerabilities** (2026-10-19) |
| S23 | False safety claims | CGDA is now a real parser-based filter; validation uses it | `services/cgda/cgda.test.js` 12/12 (unchanged original tests); `cgda.fixtures.test.js` over 34 real outputs |

## 3. Residual risks (ranked)

| ID | Risk | Severity | Plan |
|---|---|---|---|
| R-1 | Auth is verified with locally signed test tokens and a stub `auth` schema, **not yet against a live Supabase project** (JWKS fetch, real `auth.sessions` columns, email flows) | High until verified | Owner creates the project → run `scripts/smoke_api.js` with a real token, then walk through sign-up, confirm, reset and sign-out |
| R-2 | Dev-only dependency advisories: Vite 5 (dev-server path traversal, launch-editor), Tailwind 3 toolchain (braces/micromatch/postcss DoS). Fix needs Vite 8 / Tailwind 4 majors | Medium (dev machines only; the dev server binds to localhost) | Stage 7: upgrade majors and re-run the e2e suite |
| R-3 | Access token stored in `localStorage` (supabase-js default) | Medium | Mitigated by S6 and the strict CSP. Optional: cookie-based BFF with `@supabase/ssr` plus CSRF tokens |
| R-4 | Up to `AUTH_SESSION_CACHE_MS` (30 s) between sign-out and token rejection | Low | Set to 0 for immediate revocation at the cost of one indexed query per request |
| R-5 | A busy loop in generated code can still freeze the tab in browsers that run sandboxed frames on the main thread | Low (template mode emits no loops; LLM mode is off by default) | Document; consider server-side timeouts for any future server-side rendering |
| R-6 | In-process job queue: queued jobs are lost (marked failed) on restart; single node only | Medium for scale, low for correctness | Stage 8: Postgres-backed queue (`SELECT … FOR UPDATE SKIP LOCKED`) if more than one instance is needed |
| R-7 | Uploaded images live on local disk; ephemeral-disk hosts lose them (DB rows remain; the UI shows "source unavailable") | Medium | Stage 8: Supabase Storage private bucket behind the same blob interface |
| R-8 | No retention sweep yet (images kept until deleted) | Low | Stage 5: scheduled purge after `RETENTION_DAYS` |
| R-9 | `.env` contains a live Gemini key with vision **enabled** | Medium | Owner: set `VISION_ENABLED=false` unless intended; rotate the key if `.env` was ever shared |
| R-10 | The RAG catalog file is still opened read-write (it's just no longer written when unchanged) | Low | Stage 5: open with `mode=ro` |

## 4. Not done without approval

No deployment, external accounts, provider calls in tests, or destructive migrations on real data were performed.

During the Stage 1 audit, one smoke run used the local `.env` (vision enabled) and sent three fixture wireframes to Gemini. All later runs forced vision off.
