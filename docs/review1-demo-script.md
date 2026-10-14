# Review 1 demo script

1. Set `PYTHON_BIN`, start `npm --prefix backend start`, then `npm --prefix frontend run dev`.
2. Upload `services/fixtures/uploads/ecommerce-wireframe.png`.
3. Enter an optional style instruction such as “Use a clean modern light design with rounded blue buttons and responsive layout.”
4. Run the pipeline. Show source, generated preview, Code, Schema JSON, and Validation tabs.
5. Explain that **Needs review** means pipeline completion but incomplete source-structure recovery.
6. Use Source **Full view**: Fit, Zoom in, Reset, Close (or Escape).
7. Use Preview **Full view**: Fit, Zoom in, Reset, Close. This preview receives the same validated JSX artifact as Code.
8. Upload `services/fixtures/uploads/landing-wireframe.jpeg` with the same optional instruction. Explain image geometry controls layout while instructions only guide style.
9. In Debug mode, show artifact identity and preview diagnostics; leave Debug mode off during normal viewing.
10. State the five objectives: full-page detection, hierarchical schema, recursive responsive React generation, optional style instructions, and artifact-consistent preview/full-view with truthful validation.

Limitations: classical CV/OCR remains vulnerable to weak borders, perspective/glare, and unseen complex layouts. No trained visual model or measured screenshot fidelity is claimed.
