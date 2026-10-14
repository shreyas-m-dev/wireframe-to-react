# Landing preview repair: real-fixture rerun

The real fixture was processed on 2026-09-02:

- Source: `services/fixtures/uploads/landing-wireframe.jpeg`
- SHA-256: `f39bfa56259a58d2f2b0eb1e1bb02e18de8bebd3445b6199db239ee0c0ad5e08`
- Dimensions: 1024×1536 JPEG
- Final JSX artifact: `0b063f675f2d8e61` / 7214 bytes; no remote URLs.

The generated output uses local CSS media regions with source-bound aspect ratios; it contains no `placehold.co` URL. Static schema/code validation is valid and schema-to-code coverage is 1.0. The fixture status is nevertheless **needs-review**: the real detector did not recover `feature-card-grid`, `split-content-section`, or `map-region`, so source-structure coverage is 0.25.

Browser preview was not executed. Therefore `generatedJsxExecutability`, `previewSourceMatch`, `previewRenderSuccess`, and `sourceVsRenderedScore` are null, and no rendered screenshot was fabricated. In the app, Debug mode exposes the live browser outcome and a **Copy preview diagnostics** control.

Relevant real-run artifacts: `services/fixtures/outputs/landing-real/backend-preview-contract.json`, `schema.json`, `schema-tree.txt`, `ocr.json`, `generated-before-cgda.jsx`, `generated-after-cgda.jsx`, `validation.json`, and `fidelity.json`.
