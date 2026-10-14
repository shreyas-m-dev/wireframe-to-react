# Ecommerce codegen drop analysis

The prior failure was in schema-to-code preservation, not OCR detection.
`template_compiler.render_node` traversed the tree but emitted generic wrappers
without stable schema markers. `region` had no CGDA whitelist mapping, and
validation matched only a compatible tag type. Thus header/nav/control regions,
main/product area, gallery/media, product detail text, related-products/grid,
and footer could be removed or miscounted without an exact node trace.

The fix is a canonical recursive output contract: every node emits
`data-wireframe-id`, `data-wireframe-type`, and `data-wireframe-role`. Regions
render as neutral recursive wrappers, CGDA explicitly allows `region`, and
validation matches ids before tag fallback. Fixture outputs now retain
`generated-before-cgda.jsx`, `generated-after-cgda.jsx`, and `cgda-report.json`.
