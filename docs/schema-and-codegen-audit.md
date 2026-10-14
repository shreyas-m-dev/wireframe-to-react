# Schema and code-generation audit

## Real schema contract

`services/schema/schema.js:buildSchema()` returns root fields `bbox`, `position`, `size`, `layout`, `children`, and `layoutPlan`. Non-root nodes carry `type`, deterministic `id`, `role`, `confidence`, `bbox`, `relativeBounds`, `label`, `parentRole`, `layout`, `evidence`, and children.

```text
root(page-root)
└─ container(page)
   ├─ container(header) -> text/copy, input/search, button/nav-action
   ├─ container(main, row)
   │  ├─ container(gallery) -> image/media and thumbnail candidates
   │  ├─ container(product-detail) -> text, dropdown/input, primary action
   │  └─ container(related-products, grid/repeated) -> card candidates
   └─ container(footer) -> text/link candidates
```

Dashboard has no dedicated classifier. If `sidebar` macro geometry appears, the tree is page -> header/main -> sidebar + region; otherwise it is generic containers/groups.

## Generation path

```text
schema + retrieved records + instruction overrides
 -> template_compiler.compile_schema() [default]
 -> render_node() recursively -> JSX

or GEN_MODE=llm -> generate.generate_code() -> build_prompt() -> provider
```

`render_node()` uses macro roles to choose page zones and flex/grid/stack classes; leaves come from `LEAF_TYPES`. Default deterministic generation does not paste RAG snippets into output; the top record influences `_pick_root_style()` and macro geometry overrides it. LLM mode injects schema JSON and retrieved snippet code into `generate.py:PROMPT_TEMPLATE`.

The source image is never sent directly to a vision LLM. JSX depends on image pixels only through detection -> schema; RAG supplies reviewed text/JSX hints.

## Fallbacks, validation, and gaps

`template_compiler._label_for()` uses OCR label, then role/parent-aware label, then type/id fallback. Repeated generic labels remain possible when OCR fails and many leaves have no semantic role. Every detected button maps to a button, so false-positive detection becomes false-positive JSX.

`validate.js` compares schema types to JSX tags. `fidelity.js:evaluateFidelity()` rejects shallow, button-heavy page trees and missing gallery media. Neither uses a browser layout extraction or rendered screenshot comparison.

Better RAG can add reviewed page/section/schema/code examples for optional LLM and layout selection. It cannot improve OCR, pixel geometry, object boundaries, perspective, or semantic visual detection; those require labelled vision data, a model, and visual evaluation.
