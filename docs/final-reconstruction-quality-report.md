# Reconstruction quality report

The observed root causes were additive vision/CV merge, containment-driven
duplicate hierarchy, generic wrapper card styling, and validation that confused
schema markers with source resemblance. Canonical reconciliation now merges
role-compatible overlapping evidence and collapses equivalent nodes before
schema construction. Vision supplies macro semantics; CV/OCR retains tight
geometry and text.

`schemaToCodeCoverage` and `canonicalNodeCoverage` only mean emitted markers.
They are not visual accuracy. `sourceStructureCoverage`,
`layoutBoundsCoverage`, and `sourceVsRenderedScore` remain null until a real
source-vs-rendered browser comparison is run. The status is therefore
structure-generated/visual-comparison-pending, not visual-fidelity-passed.

Gemini remains optional. A failed provider call uses canonical local CV/OCR and
reports fallback; a successful call must record `vision-merged`. No accuracy
percentage is claimed here.
