# OpenAI key resolution audit

The backend starts with Node native root `.env` loading. Python inherits that
environment. `services/vision/provider.py:resolve_api_key` uses this explicit
precedence: `VISION_API_KEY`, then `OPENAI_API_KEY`, then no key. Leading and
trailing whitespace and a matching wrapping quote are removed before use.

Only `configured`, variable source, character length, and a truncated SHA-256
fingerprint are available through the Python `key_audit` helper for tests; no
HTTP endpoint returns the fingerprint. The server status endpoint returns only
`keySource` and `apiKeyConfigured`. Both the OpenAI and Anthropic request
helpers use the resolved value, so they cannot disagree with this precedence.

The previous `provider-http-429` was an OpenAI HTTP response after the request
was sent, not a general connectivity conclusion. 429 response fields are now
classified as rate-limit, insufficient-quota, request-too-large, or unknown-429
without returning the raw body. The configured image path uses Chat Completions
with a base64 data URL in the HTTPS body; no image or key is ever argv.
