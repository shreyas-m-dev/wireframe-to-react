# Generalized semantic-page compiler quality pass

## Architecture change

The compiler boundary is now explicit and one-directional:

`RawEvidence → NormalizedEvidence → SemanticCandidates → SelectedSemanticPageTree → ComponentOwnershipMap → ResolvedInteractionGraph → StateDependencyManifest → LayoutPlan → CodegenTree → JSX`.

Only `CodegenTree` is passed to the generator. Raw CV/OCR/Gemini evidence is
persisted for inspection but cannot flow directly into JSX.

## Ownership and section layout

Every retained source node is assigned exactly once in
`component-ownership-map.json`. Macro components own their direct semantic
children: Header owns Brand/Nav/actions, Hero owns its copy/action, Contact
owns form evidence, and product/gallery regions own their local children.
Unreliable visible text is dropped rather than emitted as arbitrary UI.

`layout-plan.json` persists normalized semantic bands with y/x extent, heading
anchors and confidence. These are derived from selected region geometry rather
than fixed fixture thresholds. They support normal document-flow macro layout
and prevent controls from being attached to multiple selected components.

## Text and Brand handling

Low-confidence local OCR cannot become a heading, navigation item, rating or
control merely because it is text-shaped. Exact generic labels such as
`Description`, `Product Gallery`, numbered buttons, and media captions are
not rendered. A selected top-band logo becomes a semantic Brand span with a
local accessible brand mark treatment, never an underlined nav item.

## Target resolution and local state

Before code generation, target resolution collects IDs from the selected tree.
Navigation/CTA controls gain `scrollIntoView` only when their target exists.
Unsupported navigation is converted to non-interactive nav text; there is no
`href="#"` or call to a missing ID. The ecommerce saved artifact consequently
has no generated navigation interaction when its selected tree has no valid
target.

The dependency manifest drives imports and local state. Form state is emitted
only for a selected form; search state only for a selected search field; cart
state only for selected cart/add-to-cart evidence. Backend validation now checks
state, handler and generated target declarations before allowing preview.

## Persisted job/fixture artifacts

Fixture runs now persist the requested semantic debugging chain, including:

- `raw-evidence.json`, `normalized-evidence.json`, `semantic-candidates.json`
- `selected-semantic-page-tree.json`, `component-ownership-map.json`
- `resolved-interaction-graph.json`, `state-dependency-manifest.json`
- `layout-plan.json`, `codegen-tree.json`
- `generated.jsx`, `static-validation.json`, `runtime-validation.json`

Every emitted DOM element carries source node, semantic component, provenance,
role and source-bounds data attributes.

## Local regression results

The saved landing and ecommerce fixture runs were regenerated with
`VISION_ENABLED=false`; no Gemini request was made. Both completed semantic
planning, read-only retrieval, CodegenTree compilation, CGDA and static JSX
validation. Landing preserves valid About/Services/Contact targets and semantic
Brand rendering. Ecommerce has no unresolved generated navigation target;
its resolved interaction graph is empty rather than containing unsafe target
calls. The saved output remains `needs-review` because it is local fallback and
has no real visual comparison.

Passed checks: semantic-plan tests, 33 compiler tests, backend JSX parser gate,
and exact LivePreview transform parser check. The fixture runtime report is
explicitly `not-run`: this runner has no browser runtime harness. No browser
screenshots, DOM interaction assertions or source-vs-rendered comparison were
performed, and visual score remains null.

## Files changed

- `services/semantic/ui_plan.js`
- `services/codegen/template_compiler.py`
- `services/codegen/test_template_compiler.py`
- `backend/server.js`
- `scripts/cli_pipeline.py`
- `scripts/run_validation_from_files.js`
- `scripts/run_fixture_pipeline.py`

## Constraints retained

No datasets were downloaded. No RAG records, embeddings or vectors were
changed; `vectors.sqlite3` remains read-only. No API key/configuration was
changed or exposed. No export UI, remote placeholder, source image embedding,
filename branch, hash branch or fixture-specific component tree was added.

## Remaining limitations

The classical local detector may not provide enough evidence to construct cards,
map, product variant, cart or form controls. The compiler intentionally omits
those behaviors rather than inventing them. Browser runtime and screenshot
comparison remain necessary to claim preview/visual success; until then all
local fallback outcomes remain `needs-review`.
