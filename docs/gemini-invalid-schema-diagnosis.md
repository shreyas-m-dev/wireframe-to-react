# Gemini invalid-schema diagnosis

The latest smoke request received an HTTP 200 Gemini response and extracted
candidate JSON, but failed at the old internal validator. The old request asked
Gemini for the project’s recursive `{pageCategory,nodes:[{id,type,role,bounds,
children}]}` contract directly. The response is not retained, so exact field
paths from that already-completed call cannot be reconstructed honestly. The
observable failure is: JSON parsing completed, then internal schema validation
returned `invalid-schema`.

This repair separates the contracts. Gemini now emits a shallow,
Gemini-compatible `page_type` + ordered `sections` + flat `items` shape,
documented in `gemini_response_contract.json`. `gemini_schema_adapter.py`
validates field paths/types/enums/counts/bounds, sanitizes labels, records
clamping warnings, and creates the richer internal recursive schema which is
then validated by `validation.py`. Invalid input returns a concise first failed
path such as `$.sections[0].items[0].bounds`, never a raw provider response.

The next explicit smoke test is the source of the exact current diagnostic. No
sanitized response was fabricated for the previous run, and no user image data
is stored by this diagnostic.
