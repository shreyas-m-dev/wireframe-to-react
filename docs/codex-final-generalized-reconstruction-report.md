# Final generalized reconstruction report

## Root cause and repair

The remaining fallback failure was not Gemini-related: `ui_plan.js` normalized SEND into `submit-action` before proving a field/submit evidence group. The compiler correctly emitted a submit button for that role, but the control was directly under ContactSection. CGDA correctly blocked it as `submit-outside-form`.

The semantic plan now performs form synthesis first and then enforces submit ancestry. When a field and submit share evidence, both are moved into one generated form. When a submit-like control has no field/form evidence, it is downgraded to a non-submit local action and records `submit-downgraded-no-form-evidence`. No later codegen stage needs to guess its structure.

## Codegen safety

- The compiler is the single deterministic JSX emitter.
- Void inputs are emitted self-closing.
- Form status is serialized as a complete `{submitted && (… )}` child expression.
- CGDA preserves a valid compiler artifact byte-for-byte unless it actually strips an unsupported tag; this prevents its limited tokenizer from corrupting JSX expression delimiters.
- CGDA structural checks reject void closing tags, incomplete conditionals, and submits outside forms.
- The server performs Babel JSX parsing before preview. Failure results in `overallStatus: failed`.
- LivePreview shares its import-strip transformation in `frontend/src/previewTransform.js` and will not evaluate a server-rejected artifact.

## Semantic invariants and interactions

The semantic plan maintains provenance, moves a Brand out of Nav into Header, deduplicates equivalent header/hero/form controls and headings, synthesizes forms only from supporting evidence, and removes generic invented labels. Evidence-backed navigation and CTAs use local scroll targets; forms use controlled local state with no network request. Unknown controls are downgraded rather than made invalid.

## Fallback fixture proof

Fresh execution:

```powershell
set VISION_ENABLED=false
.venv\Scripts\python.exe scripts\run_fixture_pipeline.py services\fixtures\uploads\landing-wireframe.jpeg --name landing-final-generalized2
```

Output: `services/fixtures/outputs/landing-final-generalized2/`.

The forensic runner now mirrors the production semantic-plan stage, persisting `semantic-ui-plan.json` and `codegen-schema.json` before generation. Its generated final JSX contains `[ ] SEND` as `type="button"`, not a submit control; the semantic plan records `submit-downgraded-no-form-evidence`. No `</input>` is present. It is correctly `needs-review` because local fallback evidence lacks a reliable form/card/map recovery and no browser image comparison ran.

## Tests

- CGDA: 12 passing tests, including conditional preservation and invalid void/submit checks.
- Semantic UI plan: brand movement, action dedupe, form synthesis, and submit downgrade tests pass.
- Generated JSX Babel parser gate: passes valid conditional form and rejects adjacent roots.
- Exact LivePreview import-strip/parser boundary: passes.
- Compiler: 33 passing tests, including controlled form, balanced tags, navigation, and semantic cards.
- Schema, fidelity, vision provider/adapter/reconciliation, backend syntax, and frontend contract tests pass.

## Generalization and limitations

All reconstruction rules operate on roles, text evidence, geometry, provenance and local parentage; no filename, image hash, or fixture coordinate branch was added. Existing ecommerce/auth/dashboard/card-grid schema tests remain compatible. The direct fixture run used explicit local fallback and is not represented as vision-merged. A live healthy Gemini run is required to demonstrate vision node provenance.

No browser automation or screenshot comparison is configured in this workspace, so `sourceVsRenderedScore` remains null and no visual-fidelity claim is made. No datasets were downloaded; no RAG ingestion, embeddings, vector database, API key, remote placeholder URL, or export/download UI was changed.
