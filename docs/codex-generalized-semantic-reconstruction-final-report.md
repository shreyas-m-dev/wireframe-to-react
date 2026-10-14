# Generalized semantic reconstruction repair

## Scope and safety

This pass made no provider request and changed no provider configuration,
credentials, datasets, RAG records, embeddings, or `vectors.sqlite3`. It adds
no download/export UI, remote placeholder URL, source-image embedding,
fixture-name branch, coordinate branch, or screenshot hash branch.

## Why previous coverage was misleading

Schema/code node coverage only proves that a tag was emitted for a detected
node. It does not prove that noisy OCR was meaningful, that a header is a
header, that independent regions were not mixed, or that generated state is
executable. The validation result therefore remains `needs-review` for local
CV/OCR results and for every result without an actual source-versus-rendered
comparison.

## Explicit reconstruction representations

`services/semantic/ui_plan.js` now produces a deterministic chain:

1. `RawEvidence`: canonical node text, bounds, confidence and provenance.
2. `NormalizedEvidence`: one normalized coordinate system and parent/band
   references.
3. `SemanticCandidates`: ranked roles with explanation, source evidence and
   parent candidate reference.
4. `SelectedComponentTree`: the single sanitized, deduplicated interpretation.
5. `InteractionGraph`: local scroll, form, search, cart and add-to-cart edges
   with accessibility and fallback details.
6. `CodegenTree`: the only new production input to generation, including a
   hook/state/handler dependency manifest.

The fixture runner persists all six as `raw-evidence.json`,
`normalized-evidence.json`, `semantic-candidates.json`,
`selected-component-tree.json`, `interaction-graph.json`, and
`codegen-tree.json`. The backend keeps the same data on the job semantic plan.

## Candidate selection and OCR hygiene

Selection ranks candidates using canonical role evidence, normalized position,
geometry, text vocabulary, repeated-region roles, parent context, provenance,
and confidence. Low-context local OCR fragments are omitted when they cannot
support a semantic heading, rating, navigation item or control. Generic labels
such as numbered buttons, `Description`, `Media region`, and `Product Gallery`
are never promoted into visible generated content. Unknown regions remain
neutral structural regions.

Header normalization moves a detected brand out of nav, removes duplicate
header actions, and preserves one selected interpretation. Form inference
requires both input and submit evidence. A submit-like control without those
inputs is downgraded to a regular local action instead of inventing form state.

## Code generation and interactions

`template_compiler.py` now accepts `CodegenTree` directly. It uses independent
state for detected contact forms, search fields, and evidence-backed cart
controls. Search never references contact form state. Cart controls receive
local count/open state and add-to-cart handlers only when that evidence is in
the selected tree. Image regions render local CSS placeholders with accessible
labels rather than visible generic captions or remote assets.

`backend/server.js` additionally validates the generated dependency manifest:
referenced state, handlers, and navigation targets must have matching emitted
declarations/IDs. Regeneration also retains the CodegenTree rather than falling
back to raw schema input.

## Saved local regression results

With `VISION_ENABLED=false`, the following saved artifacts were regenerated:

- `services/fixtures/outputs/generalized-semantic-landing/`
- `services/fixtures/outputs/generalized-semantic-ecommerce/`

Both completed preprocessing, local OCR/CV detection, semantic planning,
read-only retrieval, deterministic generation, CGDA, parser/static validation,
and artifact persistence. The ecommerce output contains no `formData`,
`Product Gallery`, `Description`, `keke Reviews`, `tempor bere`, or `ai ms`
fallback text. This is evidence cleanup, not a claim that local CV achieved
visual equivalence.

Semantic, compiler, CGDA, backend JSX gate, preview-transform, and frontend
contract tests passed. Browser rendering and interaction screenshots were not
run in this environment, so visual comparison remains null and status remains
`needs-review`.

## Files changed

- `services/semantic/ui_plan.js`
- `services/semantic/ui_plan.test.js`
- `services/codegen/template_compiler.py`
- `services/codegen/test_template_compiler.py`
- `scripts/cli_pipeline.py`
- `scripts/run_validation_from_files.js`
- `scripts/run_fixture_pipeline.py`
- `backend/server.js`

## Remaining limitations

Classical local CV/OCR may not recover enough reliable evidence to justify a
product selector, cart action, form, card count, map, or exact copy. In that
case the selected tree intentionally keeps a neutral region or omits the
interaction. Browser/source screenshot comparison is still required before any
visual-fidelity claim or `ready` status. When provider quota is available, run
one smoke test and then one fresh landing and one fresh ecommerce job through
the normal UI; inspect their persisted selected tree and interaction graph
separately rather than inferring quality from coverage.
