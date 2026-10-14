# Semantic UI forensics

## Evidence boundary

The handoff describes a successful live Gemini job, but the corresponding job artifacts (`vision-schema.json`, response summary, interaction plan and preview diagnostics) are not present under `services/fixtures/outputs`. The newest local fixture artifacts contain `vision-merge.json` with `used:false`. This report therefore distinguishes the reported live result from inspected local evidence and does not claim that fallback artifacts prove Gemini behavior.

## Fault chain

The prior implementation used `buildSchema` output directly in `template_compiler.compile_schema`. The compiler preserved node IDs but interpreted raw roles as JSX tags. That allowed a wrong canonical tree to become valid-looking JSX: a logo with `nav-link` role became an anchor, a contact heading detected as a button remained a button, and an input/SEND pair could stay outside a form. Structural coverage could reach one because it measured marker preservation, not semantic intent.

The relevant creators are:

- `services/schema/schema.js::makeNode` and `buildSchema`: canonical node identifiers, roles and containment.
- `services/schema/schema.js::canonicalizeLanding`: macro reparenting and local evidence filtering.
- `services/codegen/template_compiler.py::_render_leaf_tag`: former raw leaf-to-JSX translation.
- `services/validation/fidelity.js`: semantic readiness gate.

## Corrective layer

`services/semantic/ui_plan.js` now sits between canonical schema and compiler. It emits a semantic component vocabulary, interaction metadata, a sanitized code-generation tree, removals, and semantic decisions.

It removes empty headings and generic/invented labels (`Account`, `Button N`, `Description`, `Continue`), converts visible LOGO evidence to a Brand, turns CONTACT US into a heading where appropriate, changes SEND to a submit action, and synthesizes a ContactForm only when field and submit evidence coexist. It does not invent missing controls or sections.

The backend stores `semanticUiPlan`, `interactionPlan`, and `codegenSchema`; Python generation and CGDA validation consume only `codegenSchema`.

## Generated local interactions

- navigation is a keyboard-focusable button that smooth-scrolls only to local evidence-backed section IDs;
- CTA labels supported by contact/get-started evidence scroll locally;
- submit controls render `type="submit"`;
- synthesized forms prevent native navigation, reset after success, and announce a local success message;
- generated code contains no `href="#"`, no remote placeholder URL, and no visible media-region label.

## Honest validation

Fidelity still remains `needs-review` until a real preview render and source comparison provide a non-null score. A fallback source cannot pass. The earlier copied-ID coverage remains diagnostic only.
