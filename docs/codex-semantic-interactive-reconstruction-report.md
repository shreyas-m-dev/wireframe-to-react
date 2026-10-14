# Semantic interactive reconstruction report

## Files changed

- `services/semantic/ui_plan.js`
- `services/semantic/ui_plan.test.js`
- `backend/server.js`
- `services/codegen/template_compiler.py`
- `docs/codex-semantic-ui-forensics.md`

Earlier canonical provenance, macro repair and fidelity files remain the source of truth for schema construction.

## Before and after

Before, code generation consumed raw canonical nodes directly. A `nav-link` logo rendered as an underlined link, raw buttons could preserve unsupported labels, and a field plus SEND could render without a working form.

After, the pipeline is:

```text
canonicalSchema -> semanticUiPlan -> interactionPlan -> codegenSchema -> generated JSX -> CGDA/validation
```

The semantic plan maps evidence to AppShell, Header, Brand, Nav, Main, Hero, Section, AboutSection, ContactSection, ContactForm, TextInput, SubmitButton, CardGrid/Card, MediaPlaceholder, Footer and GenericRegion. It carries source IDs, bounds, confidence, evidence, accessibility data, removals and fallback reasons.

## Interaction plan

Navigation and eligible CTAs use local smooth scrolling. A detected input plus SEND creates one local ContactForm with native submit semantics, required input handling, a local success status, and no external data transmission. Cards remain non-clickable unless source evidence supplies an action.

## Validation / visual status

No browser render artifact was available or fabricated. `sourceVsRenderedScore` remains null, `visualComparisonPending` remains true, and a result must remain `needs-review`. The fixture runner invocation remains a fallback path in this environment; it cannot be used as proof of the reported live Gemini merge.

## Commands

```powershell
node services\semantic\ui_plan.test.js
node services\schema\schema.test.js
node services\schema\product_layout.test.js
node services\validation\fidelity.test.js
.venv\Scripts\python.exe services\codegen\test_template_compiler.py
.venv\Scripts\python.exe services\vision\test_provider.py
.venv\Scripts\python.exe services\vision\test_gemini_schema_adapter.py
.venv\Scripts\python.exe services\vision\test_canonical_reconciliation.py
node --check backend\server.js
npm --prefix frontend run test:contract
```

## Limitations

The live browser evaluator and persisted live-job artifacts are still required to prove rendered semantics and visual alignment. The implementation now blocks false readiness and produces local interaction behavior, but it does not claim visual source fidelity without those artifacts.
