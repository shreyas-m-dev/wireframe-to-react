# Enable and verify vision safely

Place `.env` in the repository root, next to `.env.example`; it is ignored by
Git. Start the backend from any working directory with:

```powershell
npm --prefix .\backend start
npm --prefix .\frontend run dev
```

The backend start script uses Node 22 native `--env-file=../.env`, so the root
file is loaded before `server.js`. Supported settings are `VISION_ENABLED`,
`VISION_PROVIDER` (`disabled`, `openai`, `anthropic`, `gemini`, `local`), `VISION_MODEL`,
`VISION_API_KEY`, `VISION_TIMEOUT_SECONDS`, `VISION_MAX_IMAGE_DIMENSION`, and
`VISION_MAX_OUTPUT_TOKENS`.

Example: `VISION_ENABLED=true`, `VISION_PROVIDER=openai`, and
`VISION_MODEL=gpt-4.1-mini`; keep `VISION_API_KEY` private. Startup prints only
enabled/provider/model/key-present/fallback/transport state. Verify sanitized
state at `http://localhost:3000/api/vision/status`; opening it never calls a
provider. Enable Debug mode after a job to see sanitized provider, schema, merge
and artifact state. Never paste keys in the browser, commit `.env`, or use keys
as command-line arguments.

For Google Gemini, configure either `VISION_API_KEY` or `GEMINI_API_KEY` and
set `VISION_PROVIDER=gemini`, `VISION_MODEL=gemini-2.5-flash`. Gemini key
availability, free-tier limits, and supported models depend on the Google AI
Studio account and region. The server uses the Google Generative Language REST
endpoint with an `x-goog-api-key` request header; keys and image base64 never
leave the backend process except in the encrypted provider request body.

In the current sandboxed verification environment, the enabled OpenAI request
was attempted by a real upload job but outbound provider access was denied by
the environment. The safe status was `provider-error` with
`provider-network-permissionerror`; local CV/OCR completed the job. This does
not establish provider reachability or vision quality. Run the same normal
backend command in an environment authorized to send the source image to your
configured provider to complete that verification.
