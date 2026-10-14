# Fixture generalization report

Regression fixtures are diagnostic cases, not training data. The OCR/layout
fusion only enables product-page semantics when the image evidence contains a
main region plus gallery and product-detail macros. Other layouts use generic
page/section/row/grid/control/media fallbacks.

| Fixture | Source | Result scope |
|---|---|---|
| Ecommerce product detail | `uploads/ecommerce-wireframe.png` | OCR/product hierarchy regression |
| Card grid/list | `preprocessing/fixtures/card_grid.png` | repeated/grid CV regression |
| Login/signup | `preprocessing/fixtures/login_form.png` | generic form regression |
| Dashboard | `preprocessing/fixtures/dashboard_layout.png` | generic sidebar/panel regression |
| Landing page | `preprocessing/fixtures/landing_layout.png` | generic hero/card layout regression |
| Photographed perspective/glare | unavailable locally | not claimed or fabricated |

Run each with `scripts/run_fixture_pipeline.py <path> --name <name>`. Results
must be reviewed independently; no general accuracy claim is made from the
ecommerce fixture alone.
