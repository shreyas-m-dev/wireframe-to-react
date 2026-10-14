# Ecommerce OCR fusion: after analysis

The same `ecommerce-wireframe.png` fixture was rerun after the shared
`ocr_layout_fusion` stage was enabled in `cli_pipeline.cmd_detect`, which is
the backend upload entry point.

## Before → after

| Metric | OCR baseline | OCR fusion run |
|---|---:|---:|
| Total detections | 26 | 30 |
| Buttons | 4 | 0 (four unlabeled contours are `control-region`) |
| Icons | 1 | 1 |
| Text roles | heading 2, price 1, description 3, nav 6 | product-title 1, heading 1, price 1, rating 1, description 3, nav 5, cart 1, section-heading 1 |
| Header/nav evidence | absent as structure | header + nav-group |
| Product area | implicit | explicit `product-area` |
| Related card grid | absent | `product-card-grid` with uncertainty marker |
| Hierarchy depth | 5 | 5 |
| Structural accuracy | 0.0833 | 0.3571 |
| Schema-layout gate | passed | passed |

OCR coverage is 55 words, 20 lines, and 12 groups. The resulting tree is:

```text
page
  header
    nav-group
      nav-link × 4
    cart-action
  main
    gallery
      media
    product-detail
      product-title
      rating
      price
      description × 3
      control-region × 2
    related-products
      product-card-grid (uncertain: no individual card boxes recovered)
      section-heading
  footer
```

This is still **needs review**, not high fidelity. `product-card-grid` is an
evidence-backed region only: the source visually suggests five lower cards, but
classical contour recovery did not identify five separate card bounds, so no
card nodes are invented. Likewise, no Select Model label was recognized and
the relevant rectangles remain neutral `control-region` nodes. The generator
cannot call this reconstruction high fidelity while cards/select/header-search
geometry remains incomplete.

The fixture’s retrieved records remain compatibility hints only:
`product-detail-gallery-page`, `product-detail-section`,
`product-gallery-section`, and `footer-links-row`. No RAG ingestion occurred.
