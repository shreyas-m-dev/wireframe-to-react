# AST-safe code generation and executability report

## Root cause

The form compiler emitted a self-closing input and parenthesized status conditional. The later CGDA tag tokenizer did not model arbitrary JSX expression children. When it reserialized a form containing `{submitted && (<p>…</p>)}`, it could lose expression delimiters. That is why compiler-only tests passed while a final preview artifact failed.

## Architecture repair

The deterministic compiler is the sole JSX emitter. It emits void inputs as `<input … />`, semantic form blocks, and complete parenthesized conditional status children. CGDA still filters unsupported tags, but now preserves the compiler artifact byte-for-byte when no filtering is necessary. Its structural inspector rejects void closing tags, incomplete conditionals, and submit actions outside forms.

The backend runs Babel JSX parsing after CGDA. Failure sets `generatedJsxStaticValid=false`, `previewRenderSuccess=false`, and `overallStatus=failed`. `LivePreview` refuses rejected code and supplies `React.useState` after imports are stripped, so generated forms can execute hooks.

## Before and after form

```jsx
<form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
  <input required value={formData.message} onChange={...} />
  <button type="submit">SEND</button>
  {submitted && (
    <p role="status">Message sent locally.</p>
  )}
</form>
```

## Semantic and layout repair

Semantic planning removes generic invented labels, deduplicates header/hero/form actions and headings, preserves LOGO as a Header Brand, and makes the form the only parent of its input/submit pair. Feature cards now render semantic `<article>` containers when evidence exists; image evidence stays a local aspect-ratio placeholder without remote URLs or visible media labels.

## Verification

`backend/generated_jsx_gate.test.js` covers the server parser boundary. CGDA regression tests prove valid conditional JSX is preserved and reject `</input>` plus submit-outside-form patterns. Compiler tests cover balanced form output, controlled input, local status, no hash links, and semantic card markup.

Browser screenshot/interaction evaluation remains unavailable in this workspace, so no rendered-preview success or source-vs-rendered score is claimed. Visual status remains pending. No datasets, RAG/vector data, API keys, remote placeholder service, or export/download UI changed.
