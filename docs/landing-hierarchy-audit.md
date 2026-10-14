# Landing hierarchy audit

The real landing source is now available and was processed: `services/fixtures/uploads/landing-wireframe.jpeg` (SHA-256 `f39bfa56259a58d2f2b0eb1e1bb02e18de8bebd3445b6199db239ee0c0ad5e08`, 1024×1536). The pre-existing `services/fixtures/outputs/landing` artifacts remain synthetic/generalization evidence and were not used for this audit.

| Expected region | Detected | Schema role | Parent | Bounds | Generated | Previewed | Problem |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Header / logo / nav / contact | Partial | `header`, `nav-group`, actions | page | top 13% | Partial | Browser pending | Nav OCR is incomplete/duplicated |
| Hero heading / copy / CTA | Yes | `hero-section`, `hero-heading`, action | main | y≈234–412 | Yes | Browser pending | CTA is geometry-light |
| Services / three cards | Partial | `services-section` only | main | y≈546 onward | Partial | Browser pending | Repeated card geometry missed |
| Split content | No | N/A | N/A | N/A | No | Browser pending | Missing `split-content-section` |
| About / map | Partial | `about-section` only | page | y≈1081 | Partial | Browser pending | Map region missed |
| Contact form | Partial | `contact-section`, `form` | page | y≈1339 | Partial | Browser pending | Input geometry not recovered |

Implemented generalized evidence path:

- `services/detection/ocr_layout_fusion.py::_landing_regions` requires local OCR and geometry evidence before creating `hero-section`, `services-section`, `feature-card-grid`, `about-section`, `map-region`, `contact-section`, or `form` roles. It neither reads filenames nor assigns product roles.
- `services/schema/schema.js::buildSchema` preserves those structural roles and places their children under the nearest supported macro parent.
- `services/codegen/template_compiler.py::render_node` maps header/nav/form/section roles to their semantic wrappers and preserves source bounds as markers.

Real artifacts are in `services/fixtures/outputs/landing-real/`. The run is **needs-review**, not a fidelity success, because `feature-card-grid`, `split-content-section`, and `map-region` are absent.
