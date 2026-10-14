# OpenAI vision request audit

The adapter uses `POST https://api.openai.com/v1/chat/completions` through
Python standard-library `urllib` (no SDK dependency). It requests
`VISION_MODEL` (currently configured as `gpt-4.1-mini`) with
`response_format=json_object`, temperature zero, and a strict local schema
validator. The image is read from the upload path, resized while preserving
aspect ratio to `VISION_MAX_IMAGE_DIMENSION` (default 1024), and sent as a
base64 data URL in the HTTPS request body only. The normal prompt contains the
compact schema instruction and at most 1,500 instruction characters; no CV/OCR
schema is included in the provider request.

`VISION_MAX_OUTPUT_TOKENS` defaults to 3000 for providers that support the
setting. Request timeout is `VISION_TIMEOUT_SECONDS`. There is no automatic
retry loop. HTTP 429 classification reads only safe `error.type`, `error.code`,
and `Retry-After` metadata and never exposes raw response content.

`POST /api/vision/smoke-test` is an explicit backend-only diagnostic route. It
sends a generated one-pixel PNG and minimal prompt, not an upload, and returns
only safe status/schema validity fields. It is never invoked by normal jobs.
