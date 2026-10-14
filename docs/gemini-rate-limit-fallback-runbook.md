# Gemini rate-limit fallback runbook

## Current operating mode

Gemini currently returns `HTTP 429 RESOURCE_EXHAUSTED`. During this repair pass
no Gemini request, smoke test, key change, model change, provider change, data
download, RAG ingestion, or vector-catalog modification was performed.

The application already classifies a Gemini `429` as `rate-limit`, preserves
the safe status metadata, and continues with the local CV/OCR reconstruction
path. There is no automatic provider retry loop. This is intentional: retrying
immediately after a rate limit would add traffic without proving reconstruction
quality. The local result is marked `local-cv-ocr-fallback` and remains
`needs-review`; it is not presented as vision-verified fidelity.

The local pipeline remains usable for upload, preprocessing, detection, OCR,
schema construction, semantic normalization, deterministic JSX generation,
CGDA, static JSX validation, preview interaction support where the detected
schema permits it, and validation reporting. Its diagnostics expose the
provider status only in debug/validation data.

## Saved local verification

The saved `landing-wireframe.jpeg` fixture was run with `VISION_ENABLED=false`
into `services/fixtures/outputs/landing-rate-limit-safe`. It recovered 32 local
elements and produced statically valid JSX. The artifact contains no invalid
`</input>` closing tag. Its recovered `[ ] SEND` control is a `type="button"`
action rather than a submit control, because the local detector did not recover
input-field evidence to justify inventing a form. Navigation and detected CTA
actions remain interactive through local scroll behavior.

The report deliberately remains `overallStatus: needs-review`, with
`fallbackSource: true` and a pending source-vs-rendered comparison. Internal
tree consistency is not a claim of visual equivalence to the uploaded image.

## What to run once quota is available

Run these checks **once in order**; do not loop the smoke test or retry it
rapidly.

1. Start the normal backend and call the explicit vision smoke-test endpoint a
   single time. Confirm it reports HTTP 200 and `status: success` before sending
   an uploaded image to Gemini.
2. In the normal UI, upload one fresh representative wireframe and use the
   standard pipeline once: preprocess, detect, schema, generate, validate.
   Confirm the returned job records `schemaSource: vision-merged`, a non-zero
   `schema.provenance.visionMajorNodes`, and `visionProviderUsed: true`.
3. Inspect the debug/validation report. Confirm that the generated JSX passes
   static validation and that the source-vs-rendered result is no longer the
   local fallback pending state.
4. Only after that succeeds, run one ecommerce product-detail fixture and one
   non-ecommerce fixture through the same UI flow. Verify each separately:
   header/main regions, media preservation, repeated groups, hierarchy depth,
   and absence of repeated fallback-control spam.

If step 1 still reports a rate limit, stop there and keep using the local
CV/OCR fallback. Do not alter credentials, provider settings, or RAG records
as a workaround.
