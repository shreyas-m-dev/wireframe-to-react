# Gemini 404 diagnosis and discovery

The failed request used `POST` to:

```text
https://generativelanguage.googleapis.com/v1beta/models/<VISION_MODEL>:generateContent
```

with `VISION_MODEL=gemini-2.5-flash`, normalized to one `models/` resource
prefix. Its JSON body had a system instruction, user text/instruction, image
`inlineData` with MIME type, `responseMimeType=application/json`, temperature,
and max output tokens. The API returned HTTP 404 with safe code `NOT_FOUND`.

That proves only that this generate-content resource was not found in that
request. It does not, by itself, prove whether the key lacks that model, the
resource name differs, or the API-version availability differs. The backend now
uses `GET https://generativelanguage.googleapis.com/v1beta/models` (key in
header only) at `/api/vision/gemini/models` for evidence-based discovery.

The list endpoint returns only generateContent-capable, Gemini-family,
image-capable-by-cautious-family-inference models. `VISION_MODEL` may use either
`gemini-name` or `models/gemini-name`; the request normalizer prevents doubled
`models/models/` prefixes. With `VISION_GEMINI_AUTO_SELECT_MODEL=false` (the
default), an unavailable configured model falls back to CV/OCR. Set auto-select
true only after inspecting the returned, actually listed recommendation.
