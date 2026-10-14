# Ecommerce OCR baseline analysis

Baseline source: the existing `services/fixtures/outputs/ecommerce/` artifacts
before the OCR-to-layout fusion pass. Tesseract resolved to
`C:\Program Files\Tesseract-OCR\tesseract.exe`, version `5.5.3.20260724`.

## OCR evidence

Two passes ran: normalized `--psm 6` (23 words) and upscaled `--psm 11` (46
words). After duplicate suppression the artifact contained 55 words, 20 lines,
and 12 geometry groups. Word confidence ranged from 41 to 96, with median 93.

Reliable evidence included `Product title` (94, x=551 y=288 w=102 h=26),
`$123.00` (OCR line evidence around x=550 y=421), `4 Reviews`, `Similar
Products` (96, x=444 y=799 w=136 h=34), `Home`, `Shop`, `About`, `Help`, and
`Your Cart`. The description was read across three nearby lines in the product
detail zone. Likely mistakes include `2 @ ) fone`, `Lote`, `la`, `rnin`, and a
garbled description fragment; these must not drive semantic classification.

## Classification errors

| OCR/group evidence | Current type | Expected type | Current parent | Expected parent | Required evidence |
|---|---|---|---|---|---|
| Product title | text/heading | product-title | product-detail | product-detail | OCR + top-of-detail geometry |
| $123.00 | text/price | price | product-detail | product-detail | currency pattern |
| Description lines | text/description | text-block | product-detail | product-detail | adjacent OCR line grouping |
| Home/Shop/About/Help | text/nav-link | nav group children | mixed macro containment | header | aligned header OCR lines |
| Similar Products | text/section-heading | section heading | related-products | related-products | heading immediately above repeated row |
| Lower repeated cards | missing | product-card-grid/cards | related-products | related-products | repeated geometry; no text invention |

The baseline had 26 detections: 4 buttons, 1 icon, 1 media node, 6 nav links,
3 description lines, 2 headings, 1 price, 1 section heading, and no select,
thumbnail, product-card, or repeated-group nodes. Hierarchy depth was 5 and
structural accuracy was 0.0833. The schema-layout gate passed because it only
checked its own normalized tree; it did not prove reconstruction quality.

## Repeated structure baseline

The lower `related-products` macro region was found, but no card rectangles
were recovered from its low-contrast interior. Visual inspection suggests a
row of five card-like regions, but that count is not emitted as a schema fact
until repeat geometry supports it. The baseline therefore has zero cards in
both detections and schema.

Detection coverage is an engineering estimate, not a pixel metric: major page,
main, gallery, detail, related-products, and footer zones exist; header/search,
option select, thumbnails, and product cards do not. This is low coverage for a
product page and remains `needs review`.
