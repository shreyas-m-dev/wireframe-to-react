# Vision runtime data flow

1. `frontend/src/App.jsx:run` uploads then passes optional instructions to
   `/api/detect`.
2. `backend/server.js:detectJob` invokes `scripts/cli_pipeline.py detect` with
   only the image file path and capped instruction text. The backend job has no
   key field.
3. `cli_pipeline.py:cmd_detect` runs local preprocessing/CV/OCR, then calls
   `services/vision/provider.py:analyze`.
4. `provider.status` decides opt-in configuration. `_call_openai` reads the
   image file, encodes it only inside the HTTPS request body, and sends optional
   instructions in that body. The API key is an environment header, never argv.
5. `schema_prompt.parse_json_content` parses JSON and
   `validation.validate_vision_schema` validates it before
   `merge_with_cv.merge` adds non-duplicate confident macro regions.
6. The merged local element list returns to `detectJob`, which removes the raw
   provider schema from job metadata and stores a sanitized vision summary.
7. `services/schema/schema.js:buildSchema` creates the final normalized schema;
   `generateJob` sends it by runtime file to code generation, followed by CGDA
   and validation. `result.code` is the same artifact used by Code and Preview.
8. `/api/vision/status` and Debug mode expose only provider use, validation,
   merge/schema source, and sanitized errors. Disabled/error paths preserve
local CV/OCR with `schemaSource=local-cv-ocr`.

The `/api/vision/status` endpoint is status-only: it never invokes a provider.
