# Vision analysis interface

Default mode is `VISION_PROVIDER=disabled` and `VISION_ENABLED=false`; the
product uses local OpenCV/Tesseract fallback only. No API key is read by the
frontend or committed to the repository.

Future provider configuration uses server-side environment variables:

```text
VISION_PROVIDER=openai|anthropic|local|disabled
VISION_ENABLED=true
VISION_MODEL=<provider model>
VISION_API_KEY=<server-side secret>
VISION_TIMEOUT_SECONDS=20
VISION_MAX_IMAGE_DIMENSION=1600
```

The OpenAI and Anthropic adapters are server-side only and request validated
UI-schema JSON, not JSX. Provider output is validated by `validation.py`, then
merged conservatively with OCR/CV: reliable OCR text and direct geometry
outrank semantic hints. A malformed response, timeout, or missing key fails
closed to local CV/OCR and reports a debug reason. `visionMerge` records added,
matched, and rejected provider regions; no RAG record is created or modified.
