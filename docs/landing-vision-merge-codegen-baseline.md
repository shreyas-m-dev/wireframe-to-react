# Landing vision merge/codegen baseline

The defect is architectural: the earlier merge appended unmatched Gemini nodes
to the local CV/OCR list. The schema builder then treated both as independent
regions, causing duplicate headers, nav/actions, hero/contact content, and
empty wrappers. Marker coverage could remain 1.0 despite a visually wrong page.

| Logical source region | Gemini nodes | CV/OCR nodes | Canonical outcome |
|---|---:|---:|---|
| Header/logo/nav/action | section/items | OCR/header boxes | IoU + role-compatible evidence merge |
| Hero heading/text/CTA | section/items | OCR/text/action boxes | one retained geometry node per overlap |
| Services/cards | section/items | repeated/contour boxes | vision hierarchy + local repeated geometry |
| Split/about/map | section/items | media/text boxes | one structural node, alternate role in evidence |
| Contact/input/send | section/items | OCR/control boxes | one form/control node per overlap |

`merge_with_cv.merge` now writes `duplicateReconciliation` decisions with IoU,
compatibility, retained geometry, and collapse decisions. A canonical schema is
saved by the fixture runner. The prior latest live-job artifacts were not in
this workspace, so this document does not invent per-node IDs/counts.

The compiler also no longer gives neutral structural wrappers universal card
borders, and local media placeholders render without visible `Media region`
text. Validation now labels marker coverage as schema/code coverage and keeps
visual comparison pending rather than reporting visual fidelity 100%.
