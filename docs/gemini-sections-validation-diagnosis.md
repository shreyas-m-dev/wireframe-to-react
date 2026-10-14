# Gemini sections validation diagnosis

The previous smoke diagnostic reported `$.sections expected non-empty array`.
It indicates the parsed Gemini object reached adapter validation with `sections`
missing, null, wrong type, or an empty list; the old status did not retain the
raw response, so it cannot safely distinguish those alternatives afterward.
The failing stage was adapter validation, before internal schema validation or
merge. It was not caused by page-type normalization.

The Gemini shallow contract requires `page_type` and a non-empty `sections`
array (maximum 24). Each usable section requires id, kind, bounds, and a
non-empty items array (maximum 40); each item requires id, kind, bounds, and
confidence. The smoke request is now deliberately constrained to one generic
section containing heading, button, and media items. It uses
`responseMimeType=application/json` plus a shallow native `responseSchema`.

The adapter safely recognizes a singular `section` object or a non-empty
top-level `items` array, records a warning, and still validates the resulting
section. It never accepts `sections=[]` or fabricates visible items.
