# Production reconstruction baseline

The active flow is upload → aspect-preserving preprocessing → OpenCV contour/
ROI detection plus Tesseract OCR fusion → optional schema-only vision analysis
→ conservative geometry merge → normalized schema → read-only retrieval →
deterministic React compiler → CGDA → validation → the same validated JSX in
code and preview. The detector is a macro-to-micro local strategy: regions
and repeated structures are recovered before OCR-labelled controls.

Local CV/OCR is active by default. Vision is disabled unless `VISION_ENABLED`
and a supported provider/key are configured. When enabled it returns strict
JSON only; it cannot generate JSX and its added regions are reported in
`detectionMeta.visionMerge`. The merge keeps local OCR text and rejects low
confidence or duplicate vision regions.

Current limitations are local CV/OCR ambiguity on low-contrast or photographed
screens, and no visual rendered-image comparison in the local fixture run.
Schema-to-code coverage is not source-image accuracy. The ecommerce fixture is
still `Needs review` for missing observed regions; the landing fixture is
`Needs review` for missing structural regions. No trained detector is claimed.

Priority changes implemented in this pass are strict provider validation,
provider-agnostic OpenAI/Anthropic server adapters, evidence merge, instruction
handoff at detection time, and expanded normalized-node provenance/ordering
fields. Remaining next steps are a configured provider evaluation, curated
held-out benchmarks, and a browser screenshot comparator when Playwright is
available.
