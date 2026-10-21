# Environment Variables

All configuration lives in the repo-root `.env` (gitignored; template: `.env.example`). The API validates its variables at boot and exits with a list of problems. That list names variables but never prints their values.

**Secret?** "secret" means server-only and never logged. "public" means it is bundled into the browser by design.

## Supabase / database (API)

| Name | Required | Default | Secret? | Notes |
|---|---|---|---|---|
| `SUPABASE_URL` | yes | — | no | `https://<ref>.supabase.co`; must be https in production. The JWT issuer is `<url>/auth/v1` |
| `SUPABASE_JWT_SECRET` | legacy only | — | **secret** | Set only for projects still on the shared HS256 secret; otherwise tokens are verified against the project's JWKS |
| `AUTH_SESSION_CHECK` | no | `true` | no | Confirms the session still exists and the user is confirmed, not banned and not deleted. Keep on |
| `AUTH_SESSION_CACHE_MS` | no | `30000` | no | How long a positive session check is cached; 0 = check every request |
| `DATABASE_URL` | yes | — | **secret** | Supabase *Session pooler* connection string (IPv4). `sslmode` in the URL is ignored; use `DATABASE_SSL` |
| `DATABASE_SSL` | no | `verify` in production, `require` otherwise | no | `verify` (needs CA; use in production), `require` (encrypted but the server certificate is not verified; allowed, not recommended for production), `disable` (refused in production) |
| `DATABASE_SSL_CA` | when `verify` | — | no | Path to the Supabase CA certificate |
| `DATABASE_POOL_MAX` | no | `5` | no | Keep low on the free tier's connection limit |

## Browser (Vite; bundled into the frontend)

| Name | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | yes | The **anon / publishable** key. The app refuses to start if a service-role / secret key is supplied |
| `VITE_API_BASE` | no | Only when the API is on a different origin. Default: same origin (`/api`; Vite proxies it in dev) |
| `VITE_DEV_API_TARGET` | no | Dev proxy target, default `http://localhost:3000` |

## API server

| Name | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables strict checks and HSTS |
| `PORT` | `3000` | |
| `CORS_ORIGINS` | dev: `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated bare origins; **required in production** |
| `TRUST_PROXY` | `false` | Number of proxy hops (e.g. `1`). `true` is refused because it lets clients spoof IPs |
| `ADMIN_USER_IDS` | — | Supabase user UUIDs allowed to use `/api/vision/*` |
| `DATA_DIR` | `data` | Uploaded images (relative to repo root) |
| `FRONTEND_DIST` | — | Set to `frontend/dist` to serve the SPA from the API with its CSP |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Limits

| Name | Default | Effect |
|---|---|---|
| `MAX_UPLOAD_BYTES` | 15728640 | 413 above this |
| `MAX_CONCURRENT_JOBS` | 2 | Pipelines running at once (CPU-bound) |
| `MAX_QUEUED_JOBS` | 20 | 503 when full |
| `MAX_ACTIVE_JOBS_PER_USER` | 2 | 429 `too_many_active_jobs` |
| `JOBS_PER_HOUR_PER_USER` | 30 | 429 `hourly_quota_exceeded` |
| `PIPELINE_STAGE_TIMEOUT_MS` | 180000 | Python stage killed after this |

## Pipeline (forwarded to the Python worker)

Only these families reach the Python process: `PYTHON*`, `TESSERACT_CMD`, `TESSDATA_PREFIX`, `GEN_MODE`, `RAG_*`, `VECTOR_BACKEND`, `VISION_*`, `GEMINI_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_*`, `OPENROUTER_*`, `HF_*`, plus OS basics such as `PATH`, `TEMP` and `HOME`.

| Name | Default | Notes |
|---|---|---|
| `PYTHON_BIN` | auto-detect | Path to the project venv's python |
| `TESSERACT_CMD` | — | Tesseract executable |
| `GEN_MODE` | `template` | `template` = deterministic, offline. `llm` sends schemas to an LLM provider (needs key + approval) |
| `VISION_ENABLED` / `VISION_PROVIDER` / `VISION_MODEL` / `VISION_API_KEY` / `GEMINI_API_KEY` | off | **Sends uploaded images to the provider when enabled.** Keys are secret |
| `RAG_*`, `VECTOR_BACKEND` | see `.env.example` | Retrieval settings; do not change without reindexing |
