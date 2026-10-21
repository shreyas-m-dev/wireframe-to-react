# Authentication & Data Model

**Decision (2026-10-19, owner):** Supabase for authentication and Postgres. This document is the source of truth for how identity, authorization and persistence work.

## 1. Why Supabase

| Need | How Supabase covers it |
|---|---|
| Real credential handling | Supabase Auth (GoTrue) stores bcrypt password hashes, handles sign-up, sign-in, email confirmation, password reset and refresh-token rotation. This app never sees or stores a password hash. |
| Free tier | One free project gives Postgres plus Auth (plus Storage, unused for now). Limits and pausing rules are set by Supabase and change over time; check the current free-tier page before launch. |
| One identity source for API and DB | `auth.users.id` is both the JWT `sub` and the `owner_id` foreign key on every application row. |

**Trade-off accepted:** sign-in needs an internet connection and the Supabase project. The *pipeline* stays fully offline and deterministic (`GEN_MODE=template`, vision disabled).

**Offline development:** use the Supabase CLI local stack (`supabase start`, Docker), which runs Auth plus Postgres on localhost. Point `SUPABASE_URL` and `DATABASE_URL` at it.

## 2. Authentication flow

```
Browser (supabase-js, PKCE)                 Supabase Auth                  Express API
  signUp / signInWithPassword  ─────────────▶  issues access JWT (≈1h)
                                               + rotating refresh token
  fetch /api/* with                                                       ─▶ verify JWT (jose):
  Authorization: Bearer <access JWT>                                          signature (JWKS or HS256 secret)
                                                                              iss = <SUPABASE_URL>/auth/v1
                                                                              aud = authenticated, role = authenticated
                                                                              not anonymous, sub & session_id are UUIDs
                                                                           ─▶ session check (SQL, default on):
                                                                              auth.sessions row exists and is not expired;
                                                                              user confirmed, not banned, not deleted
                                                                           ─▶ req.user = { userId, email, sessionId }
```

| Flow | Implementation |
|---|---|
| Sign-up | `supabase.auth.signUp` with `emailRedirectTo=/auth/callback`. The same "check your email" screen appears whether or not the address already exists. |
| Email verification | Supabase sends the link; `/auth/callback` completes the PKCE code exchange. The API also rejects users whose `email_confirmed_at` is null. |
| Sign-in | `signInWithPassword`. Every credential failure shows one generic message; only rate-limit and network failures are distinguished. |
| Password reset | `resetPasswordForEmail` → link → `/reset-password` (`PASSWORD_RECOVERY` event) → `updateUser({ password })`, then `signOut({ scope: 'others' })` |
| Sign-out | `signOut({ scope: 'local' })` deletes this session server-side; "Sign out on all devices" uses `scope: 'global'`. |
| Session expiry | Access tokens expire (Supabase default 1 h). The client refreshes automatically, and the API client retries once after a refresh, then signs out. |
| Server-side invalidation | The API's session check looks up `auth.sessions` (positive results cached up to `AUTH_SESSION_CACHE_MS`, default 30 s). A signed-out or banned user's token stops working within that window, not at token expiry. |

**Token storage.** supabase-js keeps the session in `localStorage`. This is the standard SPA pattern. The XSS exposure it implies is mitigated as follows:
- Generated code never runs in the app's origin (sandboxed opaque-origin iframe).
- The production CSP is `script-src 'self'`, with no inline scripts and no third-party scripts.
- No user HTML is rendered.
- The API uses bearer tokens, not cookies, so CSRF does not apply. CORS has no `credentials`.

**Why no cookie BFF:** an httpOnly-cookie backend-for-frontend would remove token-in-JS exposure, but it adds CSRF handling and refresh plumbing in Express. That is a reasonable future hardening step (see SECURITY_REVIEW R-3).

## 3. Authorization

- Every `/api/*` route except `/api/health` and `/api/ready` runs `requireAuth`.
- **Object-level authorization lives in SQL:** every repository read and write includes `owner_id = $userId`. A foreign object and a missing object both return **404**, so there's no existence oracle.
- **The DB enforces ownership consistency:** composite foreign keys `(project_id, owner_id) → projects(id, owner_id)` (and the same for results and artifacts) make it impossible to attach a row to another user's project.
- Ownership comes only from the verified token. `owner_id`/`userId` fields in request bodies are ignored, and tests assert this.
- **Admin** (only `/api/vision/*`, which can incur provider cost) means the user's UUID is listed in `ADMIN_USER_IDS`. Token claims such as `app_metadata.role` are deliberately not trusted for this.
- **Row Level Security:** enabled on every `app.*` table with **no policies**, and `anon`/`authenticated` have all privileges revoked. The tables live in the `app` schema, which the Supabase Data API doesn't expose. Express connects as the table owner and is the only data path.

## 4. Schema (migration `0001_app_schema`)

```
auth.users (Supabase-managed)
   │ 1
   ├──< app.projects        id, owner_id, name(1–120), created_at, updated_at
   │        │ 1                     unique(id, owner_id)
   │        └──< app.jobs     id, project_id, owner_id, parent_job_id, status, stage, instructions(≤1500),
   │                 │         source_filename/mime/bytes/sha256/path, gen_mode, schema_source,
   │                 │         error_code, error_message(≤500), idempotency_key, timestamps
   │                 │         FK (project_id, owner_id) → projects; unique(owner_id, idempotency_key)
   │                 ├──1 app.job_results   detections, detection_meta, schema, validation, templates,
   │                 │                      recognized_instructions (jsonb)
   │                 └──< app.artifacts     kind ∈ {jsx, preview-js}, content, sha256, byte_length, meta
   │                                         unique(job_id, kind)
   └── on delete cascade everywhere: deleting a Supabase user deletes all their data
```

- **Indexes:** `projects(owner_id, updated_at desc, id desc)`, `jobs(project_id, created_at desc, id desc)`, `jobs(owner_id, created_at desc)`, a partial index for active jobs, and `artifacts(owner_id)`.
- **Checks:** status and stage enums, MIME allowlist, SHA-256 format, length limits.
- **Pagination:** keyset (`created_at`/`updated_at`, `id`), with opaque base64url cursors.
- **Idempotency:** a client-supplied `Idempotency-Key` header. Replays return the original job without spending quota.
- **Source images** live on disk at `DATA_DIR/uploads/<owner>/<job>.<ext>` (mode 0600), *not* in Postgres. They are deleted with their job or project.
- **The RAG catalog** (`services/rag/vectors.sqlite3`) is separate from all of this. It is read-only at runtime and is not the app database.

## 5. Migrations

```bash
npm run migrate          # apply pending (also: npm run migrate -w backend -- status)
npm run migrate:down     # revert the latest migration
```

- **Tracking:** applied versions are recorded in `app_meta.schema_migrations` with a SHA-256 of the up script. Editing an applied migration is refused.
- **Safety:** each step runs in a transaction under `pg_advisory_xact_lock`, so concurrent deploys are safe.
- **Boot check:** the server refuses to start while migrations are pending.
- **Verified:** up → down → up on real Postgres (PGlite) in `backend/test/migrations.test.js`.
- **Rollback warning:** `0001.down` drops all application data. Run it only on a database you intend to empty.

**Compatibility plan (net-new auth):**
- There was no persisted data before this change: the old in-memory jobs vanished on restart. No data migration is required.
- The old anonymous stage endpoints (`/api/upload`, `/api/process`, `/api/detect`, `/api/schema`, `/api/generate`, `/api/validate`, `/api/job/:id*`) are **removed**. They are replaced by the owner-scoped job API below. The bundled frontend is the only known client.

## 6. API (all routes require `Authorization: Bearer <Supabase access token>`)

| Method & path | Purpose |
|---|---|
| `GET /api/health`, `GET /api/ready` | Public liveness; readiness checks the DB |
| `GET /api/me` | User, limits, generation mode |
| `GET/POST /api/projects` | List (paginated) / create |
| `GET/PATCH/DELETE /api/projects/:id` | Read / rename / delete (cascades jobs and images) |
| `GET /api/projects/:id/jobs` | Job history (paginated) |
| `POST /api/projects/:id/jobs` | Multipart `wireframe` + `instructions`, optional `Idempotency-Key` → **202** |
| `GET /api/jobs/:id` | Status and current stage (poll this) |
| `GET /api/jobs/:id/result` | Detections, schema, code, compiled preview, validation |
| `GET /api/jobs/:id/source` | Original image |
| `GET /api/jobs/:id/export` | Zip of a runnable Vite + React + Tailwind project |
| `POST /api/jobs/:id/cancel` · `POST /api/jobs/:id/regenerate` · `DELETE /api/jobs/:id` | Lifecycle actions |
| `GET /api/vision/status` · `POST /api/vision/smoke-test` · `GET /api/vision/gemini/models` | Admin only |

Errors are always `{ "error": { "code", "message", "requestId" } }` with a meaningful HTTP status (400/401/403/404/409/410/413/415/422/429/500/503).

## 7. Supabase project setup (owner checklist)

1. Create the project and note its URL, the anon/publishable key, and the database password.
2. **Authentication → Providers → Email:**
   - Enable it, with **Confirm email** turned on.
   - Set the minimum password length to at least 8.
   - Optionally enable CAPTCHA (hCaptcha or Turnstile) for brute-force resistance.
3. **Authentication → URL Configuration:**
   - Set **Site URL** to your app origin.
   - Add `<origin>/auth/callback` and `<origin>/reset-password` to the redirect allowlist.
4. **Authentication → Rate Limits:** review the defaults (they are Supabase's brute-force protection for sign-in and sign-up).
5. **Database → Connect → Session pooler:** copy the connection string into `DATABASE_URL`.
6. **Database → Settings → SSL:** download the CA certificate for `DATABASE_SSL=verify`.
7. Put the values in `.env` (see ENVIRONMENT_VARIABLES.md), then run `npm run migrate`.
8. Never put the `service_role` / secret key in this app. Nothing here needs it, and the frontend refuses to start with one.
