# Executable semantic repair report

## Root cause

The generated form-status expression previously had no enforced parser gate between code generation and preview. A malformed conditional expression could therefore reach the browser preview. In addition, the preview removed ES imports before evaluating generated code but did not supply the named `useState` binding required by hook-based generated forms.

## Repair

- `services/codegen/template_compiler.py` now emits the status using the unambiguous form:

```jsx
{submitted && (
  <p role="status">Message sent locally.</p>
)}
```

- Generated forms use `formData` and `submitted` state, a controlled required input, `type="submit"`, local `preventDefault`, reset state, and a status announcement.
- `frontend/src/LivePreview.jsx` now supplies `React.useState` to dynamically compiled generated code after import stripping. It refuses to execute code rejected by the server static gate.
- `backend/server.js` now parses final JSX with the installed Babel JSX parser before it is made previewable. Static parse failure reports `generatedJsxStaticValid=false`, `previewRenderSuccess=false`, and `overallStatus=failed`.
- `services/semantic/ui_plan.js` now deduplicates header actions, hero actions/copy, section headings, form inputs/submits, and moves a brand out of a nav into the header. Decisions are retained in `semanticDecisions`; discarded candidates are documented in `droppedNodes` or semantic decisions.

## Validation

`backend/generated_jsx_gate.test.js` proves a parenthesized conditional form parses and a multiple-root JSX sample is rejected. Compiler tests additionally assert balanced form tags, controlled form output, status rendering, and no hash navigation links.

## Preview/browser status

The frontend preview receives the static validation result and will not execute a parser-rejected artifact. A full browser interaction/screenshot evaluator is not configured in this workspace, so no browser screenshot, preview-success claim, or source-vs-rendered score is fabricated. Visual comparison remains pending and must remain `needs-review` once static parsing succeeds.

## Constraints honoured

No filenames are used for semantic planning, no source image is embedded in generated output, no API keys/RAG records/vector database were changed, and no remote placeholder service or download UI was added.
