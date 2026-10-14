# Generalized visual-semantic engine pass

## Architecture changes

The production boundary now carries a typed visual-semantic chain:

`RawEvidence → NormalizedEvidence → StyleEvidence → LayoutTopology/RegionGraph → PageFamilyHypotheses → SemanticCandidates → SelectedSemanticPageModel → ComponentDataModels → InteractionStatePlan → ThemeTokenPlan → ResponsiveLayoutPlan → CodegenTree → React artifacts`.

`CodegenTree` remains the only source accepted by the deterministic compiler.
Raw CV/OCR/vision evidence is retained for diagnostics, ownership and
provenance, but is never emitted directly as JSX.

## Local style extraction

`services/visual/style_extractor.py` samples the actual uploaded pixels using
local OpenCV quantization and edge density. It records dominant colours,
monochrome/dark hints, density, radius/shadow hints and an accessible token
plan. It avoids a fake image/style service. Monochrome wireframes receive an
accessible neutral theme with a conservative blue primary; colour screenshots
retain a sampled accent when contrast permits it.

The backend gathers this at `/api/process`, before semantic generation. The
plan is passed into CodegenTree and emitted as local CSS variables on the page
root. Fixture runs persist `style-evidence.json`, `theme-token-plan.json`,
`responsive-layout-plan.json`, `interaction-state-plan.json` and
`generated.css` alongside the existing artifacts.

## Page models, text and interactions

Page family selection still requires multiple evidence signals before selecting
landing, ecommerce, authentication or dashboard semantics. Otherwise the
generic model is deliberately conservative. Candidate selection filters weak
OCR before it can become a high-semantic component. Ownership gives every kept
node one selected owner; target resolution only emits navigation code when an
actual generated target exists.

Authentication evidence with fields and a login action produces an AuthForm
model with separate login/password state, password input semantics, native
submit behavior and local auth-specific status. Contact/search/cart state is
not reused for it. Product/cart/search controls remain evidence-gated.

## Local verification

With `VISION_ENABLED=false`, `landing-wireframe.jpeg` was regenerated into
`services/fixtures/outputs/visual-semantic-landing/`. The saved style evidence
shows the source is monochrome and produces a light accessible token plan.
The generated JSX carries those local tokens; `generated.css` contains the
same variables. The run completed detection, semantic planning, CodegenTree
generation, CGDA and static validation without a provider request.

Passing checks:

- semantic UI plan tests including authentication model selection;
- 34 template compiler tests;
- backend JSX parser gate;
- LivePreview transform parser boundary;
- Python/Node syntax checks and frontend contract test.

## Browser and visual status

The fixture runner has no browser runtime harness, so runtime validation is
explicitly `not-run`; no screenshot or source/rendered comparison exists.
Visual score stays null and local fallback results remain `needs-review`. This
report makes no claim of visual fidelity or production screenshot equivalence.

## Changed files

- `services/visual/style_extractor.py`
- `scripts/cli_pipeline.py`
- `scripts/run_fixture_pipeline.py`
- `scripts/run_validation_from_files.js`
- `services/semantic/ui_plan.js`
- `services/codegen/template_compiler.py`
- `backend/server.js`
- `docs/codex-generalized-visual-semantic-engine-report.md`

## Constraints and limitations

No dataset was downloaded; no RAG record, embedding or vector data was changed;
`vectors.sqlite3` was not modified. No key was exposed or changed. No export
UI, remote placeholder URL, source-image embedding, fixture filename branch or
image-hash branch was added.

The local detector can still lack evidence for full card grids, maps, contact
forms, product variants or a specialized page family. The compiler preserves a
safe generic representation instead of inventing those components. A browser
runtime/screenshot comparison remains the next required proof step.
