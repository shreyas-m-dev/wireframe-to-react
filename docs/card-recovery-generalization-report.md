# Card recovery generalization report

The detector is category-neutral first: any accepted cluster is
`repeated-card-grid`/`card`; it upgrades to product cards only under existing
product-page evidence. Login controls and unrelated rectangles are not cards.

Synthetic card-grid, dashboard, landing, and login fixtures are rerun through
the same ROI code. Their results are diagnostic-only due limited synthetic
detail; they do not establish real-world accuracy. The ecommerce fixture found
a five-item repeated group from multi-pass consensus; this result is not a
hard-coded expected count and still requires further source validation.
