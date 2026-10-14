# Page-family and component-model reconstruction pass

## Architecture before and after

The prior compiler already had canonical evidence, semantic selection and a
CodegenTree boundary. This pass inserts two additional evidence-led decisions
before JSX:

`RawEvidence → NormalizedEvidence → RegionGraph → PageFamilyHypotheses → SemanticCandidates → SelectedSemanticPageTree → ComponentDataModels → InteractionGraph → StateDependencyManifest → LayoutPlan → CodegenTree → JSX`.

No raw CV, OCR or vision node bypasses the selected semantic tree into JSX.

## Page family selection

`services/semantic/ui_plan.js` scores landing, ecommerce product/catalog,
authentication, dashboard, article, profile and generic hypotheses using text
vocabulary, selected macro roles, input count, gallery/product evidence,
repeated-card evidence and sidebar evidence. It selects a specialized family
only above a confidence threshold; otherwise it preserves a generic semantic
page. The logic has no upload filename, image hash, fixture ID or fixed
coordinate condition.

## Component models and authentication

When field plus login/password/submit evidence is sufficiently strong, the
selected plan creates an `AuthForm` component model with independently owned
login and password fields, one primary submit, and any detected helpers. The
compiler then emits separate `authEmailOrUsername` and `authPassword` state,
a password input, a native submit button, and local-only auth feedback. It
does not use contact-form state or contact success text. Helper actions are
local feedback only; no external identity call is created.

The auth fixture available in this workspace produced no usable OCR/field
evidence during the local-only run, so it selected `generic` rather than
fabricating a login page. A synthetic semantic-schema regression supplies the
required evidence and verifies the AuthForm plan and resulting JSX contract.

## Text, ownership and interaction safety

Low-context OCR and generic labels are removed before visible promotion.
Candidate selection retains source/provenance for debugging but only selected
roles reach codegen. Ownership assigns each retained node one selected owner.
Navigation and CTA targets are resolved from generated section IDs first;
unsupported links are downgraded rather than emitting missing
`getElementById` calls. Search/cart/form state remains independent and is
emitted only when selected semantic evidence requires it.

## Persisted artifacts

Fixture runs now persist `region-graph.json`, `page-family-hypotheses.json`
and `component-data-models.json` in addition to the previously persisted
evidence, candidate, ownership, interaction, dependency, layout, CodegenTree,
static-validation and runtime-validation artifacts.

## Validation and tests

Passed locally:

- semantic-plan tests, including authentication family/model selection;
- 34 deterministic compiler tests, including separate auth field state,
  password type, submit semantics and local auth status;
- backend JSX parser gate;
- LivePreview import-strip parser boundary;
- local-only fixture pipeline runs for ecommerce and the available auth image.

The ecommerce artifact emits no unresolved navigation target call. The local
auth image correctly remains generic because it lacks sufficient detected
evidence. Browser runtime evaluation and screenshots are not configured in
this fixture runner; `runtime-validation.json` explicitly says `not-run` and
visual score remains null. No visual-fidelity claim is made.

## Files changed

- `services/semantic/ui_plan.js`
- `services/semantic/ui_plan.test.js`
- `services/codegen/template_compiler.py`
- `services/codegen/test_template_compiler.py`
- `scripts/run_validation_from_files.js`
- `scripts/run_fixture_pipeline.py`
- `docs/codex-page-family-component-model-reconstruction-report.md`

## Constraints retained and limitations

No dataset download, RAG ingestion, embedding/vector mutation,
`vectors.sqlite3` change, API key change/exposure, export UI, remote
placeholder, source-image embedding, or fixture-specific branch was added.

Classical CV/OCR can still fail to recover enough evidence for a specialized
page family. In that case the compiler intentionally emits a safe generic page
instead of invented auth, product, price, cart, map or contact behavior. Real
browser rendering and screenshot/source comparison are still required before
any page can be described as visually faithful or `ready`.
