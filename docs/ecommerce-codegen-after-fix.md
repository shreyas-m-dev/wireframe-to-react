# Ecommerce codegen after compiler fix

The same ecommerce schema has 28 nodes. The previous generated result matched
10 nodes (structural accuracy 0.3571); the marker-aware recursive renderer
emits and validates all 28 nodes (coverage and structural accuracy 1.0).
Generated JSX now includes header/nav/cart, main, gallery/media, vertical
product detail with title/rating/price/descriptions/control regions, related
products with heading/grid, and footer.

This is not high fidelity. The detected grid has no individual product-card
geometry, so `repeatedGroupCoverage=0` and `needsReview=true`. No cards or
thumbnails are invented.
