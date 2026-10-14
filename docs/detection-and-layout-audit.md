# Detection and layout audit

## Active detector

The active path is `scripts/cli_pipeline.py:cmd_detect()` calling `services/detection/heuristic_detector.py:detect_from_array()` plus optional `ocr_extractor.py`. It is hybrid classical CV/OCR, not a trained model. It does not call YOLO, DETR, a VLM, segmentation model, or direct image-to-LLM vision API. `detect.py:Detector` and `sidecar.py` are optional YOLOv8 code only; no weights or routing to it exist.

## Exact operations

| Layer | Operations/functions |
|---|---|
| Validation/preprocess | `preprocess.validate_input`, `resize`, `to_grayscale`, `denoise_blur` (3×3 Gaussian), `normalize`; image always resizes to 1024×1024. |
| OCR pre-pass | `extract_text_regions`, `mask_out_text_lines`; failures are swallowed. |
| Edges | `GaussianBlur`, `Canny(40,120)`, `adaptiveThreshold(...,31,8)`, `MORPH_OPEN(2×2)`, OR, `dilate(3×3)`. |
| Shapes | `findContours(RETR_LIST)`, contour-area filter, bounding rectangles, ink fill ratio. |
| Merge/NMS | `_drop_near_duplicate_boxes` IoU > 0.4; `_merge_shape_fragments` uses overlap components; X placeholders use `HoughLinesP`. |
| OCR second pass | `extract_text_lines` groups Tesseract results; `attach_labels` attaches words to widget boxes. |
| Macro layout | `_detect_macro_regions` creates page/header/main/footer and possible gallery/product-detail/related-products. |
| Schema layout | `schema.js:buildSchema`, `smallestContaining`, `inferLayout`; macro role hierarchy wins over generic containment. |

## Class and role rules

- **Page/header/main/footer:** full canvas page; header is top 13% when ink density > .008; main ends at 86%; footer requires bottom ink > .006.
- **Gallery/product detail:** both halves of main require ink > .006 and width >= 500. This is two-column geometry, not semantic classification.
- **Related products:** lower 30% of split main requires ink > .012.
- **Media:** fill > .55 and dimensions >60px, or X-crossed merge. A gallery without media gets structural recovery image evidence.
- **Text:** OCR lines when Tesseract succeeds; otherwise short/wide/low-fill contour.
- **Button:** aspect 1.4–6, height 20–90. **Input:** aspect >2, fill <.15, height <60. **Icon:** square 16–42, fill >.18.

`MIN_AREA=200`, `MAX_AREA_FRACTION=.92`, and `MIN_ACCEPTED_CONFIDENCE=.58` are the principal filters. Low-confidence generic containers survive only when they contain two accepted children. Macro regions bypass NMS.

## Hierarchy and limitations

The schema attaches header/main/footer to page and gallery/detail/related/sidebar to main, then assigns remaining containers/leaves to the smallest containing parent. Rows use vertical overlap >=50%; layout is row if vertical spread <=55% max child height, column if horizontal spread <=55% max width, otherwise grid. Similar size within 18% and at least three children indicates repetition.

Classical contours can recover boxes, lines, density bands, and repetition. They cannot reliably recognize visual intent, DOM semantics, perspective-distorted laptop photos, glare, browser chrome, arbitrary photos, overlapping content, or low-contrast outlines. No perspective correction, screen-border detector, homography, trained classifier, segmentation, or screenshot/DOM comparison exists.

The previous repeated-control failure came from broad contours satisfying button geometry while media/text were dropped; generic containment then rendered leaves first. Role-first schema and `fidelity.js` now reduce that failure, but they do not turn the system into a near-pixel vision model.

## Fixture workflow and report format

Use `services/fixtures/README.md`. For each approved local fixture, save `services/fixtures/outputs/<name>.json`:

```json
{"image":"product-page.png","dimensions":[1440,1800],"macroRegions":["page","header","main"],"totalDetections":0,"hierarchyDepth":0,"repeatedGroups":[],"retrievedRecords":[],"generatedCode":"outputs/product-page.jsx","fidelityScore":0,"missingOrMisclassified":[]}
```

Do not claim a fixture passes until that exact image has run through the installed pipeline.
