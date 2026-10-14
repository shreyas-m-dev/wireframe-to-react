# `spawn ENAMETOOLONG` root cause and repair

## Cause

The failing frontend route was `App.jsx` → `POST /api/generate` →
`backend/server.js:generateJob`. Before this repair, `generateJob` called
`callPython(['generate', JSON.stringify(job.schema), 'null', instructions])`.
`callPython` uses Node `child_process.execFile` to launch:

```text
<PYTHON_BIN> scripts/cli_pipeline.py generate <full-schema-json> null <instructions>
```

The full schema was therefore an argv value. It is neither image data nor a
shell command: it is a Windows `CreateProcess` command-line-length failure.
The ecommerce run's serialized input was about 32,504 bytes and landing's was
about 28,469 bytes before provider/request expansion; the regression payload
was 99,957 bytes. The latter includes a 48 KiB schema label plus a large
validation/instruction body and deterministically exceeded the new 8,192-byte
argv guard. This is not a file-path limit: the runtime paths are short
`%TEMP%\\w2r\\<UUID>\\generate-file-*.json` paths.

## Repair

`backend/server.js:47` now provides `callPythonFile`. `generateJob` at line 70
and validation regeneration at line 73 call:

```text
<PYTHON_BIN> scripts/cli_pipeline.py generate-file <input-path> <output-path>
```

Only short paths enter argv. The input JSON file contains schema, optional
validation diff, and instructions; the output JSON contains generated JSX and
metadata. Provider image base64 stays inside the provider HTTP body in Python;
keys are environment-only and never argv/logged. `callPython` and
`callPythonFile` calculate argument byte lengths and refuse any value over
8,192 bytes before spawn.

The forensic fixture runner already does generation in-process and calls its
Node schema/validation runner with file paths, so it does not use the old
failing function. Frontend uploads and backend regeneration now share the same
file transport.

## Verification

- `backend/subprocess_transport.test.js` passed with a 99,957-byte input and
  generated 50,720-byte JSX output.
- The staged HTTP workflow used by `App.jsx` completed ecommerce generation
  (7,723-byte final code) and landing generation (8,051-byte final code), then
  validation, with vision disabled.
- No dataset was downloaded, no RAG record was ingested, and
  `services/rag/vectors.sqlite3` was not modified.
