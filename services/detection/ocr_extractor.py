"""
OCR text extraction — reads whatever text is actually drawn in the
wireframe (placeholder text like "Name" or "Email Address" inside an
input box, button labels like "Submit" or "Sign Up", heading text) so the
generated code uses that real text instead of a generic "Input 1" /
"Button 1" placeholder.

Uses Tesseract OCR (via pytesseract) — a real, mature, deterministic OCR
engine, not an LLM guessing at what the text "probably" says. It either
reads a word correctly or doesn't detect it at all (reported via
confidence score); it does not hallucinate text that isn't there.

Design note on word grouping: an earlier version of this module grouped
OCR words into multi-word phrases ("Email Address") using a generic
horizontal-pixel-gap heuristic, independent of the detected UI elements.
That's fundamentally ambiguous — verified directly against a real nav
header fixture: two adjacent short button labels ("Login", "Sign Up") can
sit closer together than the words *within* a single longer label
("Email Address"), so no single gap threshold gets both cases right.

Fixed by inverting the approach: `extract_text_regions` now returns
individual WORD-level regions with no grouping at all, and `attach_labels`
— which already knows the real detected element boundaries from
heuristic_detector.py — groups words by which element's bounding box
actually contains them. This ties word-grouping to the pipeline's own
detected structure instead of a generic pixel heuristic, which is both
more principled and more accurate.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import pytesseract
from ocr import configure_tesseract

MIN_CONFIDENCE = 40  # tesseract's own 0-100 confidence score; below this, treat as noise


def _image_data(image: np.ndarray, *, config: str = "--psm 6") -> dict:
    status = configure_tesseract()
    if not status["enabled"]:
        raise RuntimeError(status["reason"])
    return pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config=config)


@dataclass
class TextLine:
    """A full line of OCR text (all words on the same Tesseract line,
    joined) — used as an authoritative standalone "text" schema element
    (see module docstring's "Two OCR use cases" section), distinct from
    the word-level TextRegion used for attaching labels to widgets."""
    text: str
    x: float
    y: float
    width: float
    height: float
    confidence: float


def extract_text_lines(
    image_path_or_array,
    min_confidence: int = MIN_CONFIDENCE,
    exclude_boxes: list[dict] | None = None,
) -> list[TextLine]:
    """
    Groups OCR words into LINES using Tesseract's own
    (block_num, par_num, line_num) grouping — real layout analysis
    Tesseract already does internally, not a heuristic gap threshold. Used
    as the authoritative source for standalone text elements (headings,
    paragraphs) — see heuristic_detector.py's fragment-merging docstring
    for why CV contour detection should never be the source of truth for
    text: individual letters/word-fragments in a heading get misread as
    separate buttons/icons/containers by generic shape classification.

    `exclude_boxes` (optional): bounding boxes of already-detected widgets
    (buttons, inputs, etc). Any word whose center falls inside one of
    these is dropped before line-grouping — this is essential, not
    optional, whenever the image has multiple separate UI elements sitting
    at a similar height (e.g. a logo + two nav buttons in a header row).
    Tesseract's line grouping is purely about vertical position; it has no
    idea "LOGO", "Login", and "Sign Up" are three different widgets just
    because they're on the same visual row, and will merge them into one
    garbled line otherwise — verified directly against exactly that
    layout. Pass the widget boxes you already have (from
    heuristic_detector's shape detection pass) so a widget's own label
    text doesn't get double-claimed as a standalone text line AND lost
    from that widget's `attach_labels` matching.
    """
    if isinstance(image_path_or_array, (str,)):
        img = cv2.imread(image_path_or_array)
        if img is None:
            raise ValueError(f"Could not read image: {image_path_or_array}")
    else:
        img = image_path_or_array

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    cleaned = _remove_border_lines(thresh)
    data = _image_data(cleaned)

    def _is_excluded(cx: float, cy: float) -> bool:
        if not exclude_boxes:
            return False
        for box in exclude_boxes:
            if box["x"] <= cx <= box["x"] + box["width"] and box["y"] <= cy <= box["y"] + box["height"]:
                return True
        return False

    lines: dict[tuple[int, int, int], list[int]] = {}
    for i in range(len(data["text"])):
        word = data["text"][i].strip()
        conf = float(data["conf"][i])
        if not word or conf < min_confidence:
            continue
        cx = data["left"][i] + data["width"][i] / 2
        cy = data["top"][i] + data["height"][i] / 2
        if _is_excluded(cx, cy):
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(i)

    result: list[TextLine] = []
    for idxs in lines.values():
        idxs.sort(key=lambda i: data["left"][i])
        words = [data["text"][i].strip() for i in idxs]
        xs1 = [data["left"][i] for i in idxs]
        ys1 = [data["top"][i] for i in idxs]
        xs2 = [data["left"][i] + data["width"][i] for i in idxs]
        ys2 = [data["top"][i] + data["height"][i] for i in idxs]
        confs = [float(data["conf"][i]) for i in idxs]
        result.append(
            TextLine(
                text=_sanitize_ocr_text(" ".join(words)),
                x=float(min(xs1)),
                y=float(min(ys1)),
                width=float(max(xs2) - min(xs1)),
                height=float(max(ys2) - min(ys1)),
                confidence=sum(confs) / len(confs),
            )
        )
    return result


def mask_out_text_lines(gray_img: np.ndarray, text_lines: list[TextLine], padding: int = 4) -> np.ndarray:
    """
    Paints over each detected text line's region with flat white, on a
    COPY of the image, before that copy is handed to the CV contour
    detector (heuristic_detector.py). This is what stops individual
    letters/words from being contour-detected as fake UI widgets — the
    detector never even sees the text pixels for regions OCR has already
    claimed. Padding gives a small margin so anti-aliased glyph edges
    right at a line's bounding-box border don't leave a stray fragment.
    """
    masked = gray_img.copy()
    h, w = masked.shape[:2]
    for line in text_lines:
        x1 = max(0, int(line.x) - padding)
        y1 = max(0, int(line.y) - padding)
        x2 = min(w, int(line.x + line.width) + padding)
        y2 = min(h, int(line.y + line.height) + padding)
        masked[y1:y2, x1:x2] = 255
    return masked


def _sanitize_ocr_text(text: str) -> str:
    """
    Strips `<`/`>` from OCR output before it's ever used as a label.

    Real-world reason: services/cgda/cgda.js's JSX parser is a hand-written
    regex tag-scanner, not a full AST parser (documented limitation — no
    `@babel/parser`, since that needs npm install with network access), so
    it can't tell the difference between an actual `<tag>` and a literal
    `<`/`>` character that happens to appear inside a JS string literal.
    Verified directly: a label like `Don't "click" <me>` gets the `<me>`
    misread as a hallucinated tag and stripped, corrupting the button's
    content. UI placeholder/button copy essentially never legitimately
    contains angle brackets, so stripping them here is a safe, pragmatic
    fix rather than a real content loss.
    """
    return text.replace("<", "").replace(">", "")


@dataclass
class TextRegion:
    """A single OCR-recognized WORD (not a pre-grouped phrase) — see
    module docstring for why grouping happens later, in attach_labels."""
    text: str
    x: float
    y: float
    width: float
    height: float
    confidence: float

    @property
    def center(self) -> tuple[float, float]:
        return (self.x + self.width / 2, self.y + self.height / 2)


def _remove_border_lines(binary_img: np.ndarray) -> np.ndarray:
    """
    Wireframe box borders (long straight horizontal/vertical lines) confuse
    Tesseract's automatic page-layout analysis badly enough that it can
    give up on the whole image and return nothing — verified directly: the
    same text with the same contrast OCRs perfectly once cropped away from
    a nearby box border, and fails on the full image. This is the standard
    document-OCR fix: detect long lines via morphological opening (a
    structuring element long in one dimension catches lines but not
    compact text glyphs) and erase them before running OCR.

    `binary_img`: black text/lines on white background. Returns the same
    format with border lines erased.
    """
    inv = cv2.bitwise_not(binary_img)  # white foreground on black, for morphology
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    horiz_lines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, horiz_kernel)
    vert_lines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, vert_kernel)
    lines_mask = cv2.bitwise_or(horiz_lines, vert_lines)
    text_only = cv2.bitwise_and(inv, cv2.bitwise_not(lines_mask))
    return cv2.bitwise_not(text_only)


def extract_text_regions(image_path_or_array, min_confidence: int = MIN_CONFIDENCE) -> list[TextRegion]:
    """
    Runs OCR on the original (not resized/blurred) image for best text
    fidelity: grayscale -> lenient threshold -> border-line removal ->
    Tesseract. Returns one TextRegion PER WORD — grouping words into
    phrases happens in `attach_labels`, using the real detected element
    boundaries rather than a generic gap heuristic (see module docstring).
    """
    if isinstance(image_path_or_array, (str,)):
        img = cv2.imread(image_path_or_array)
        if img is None:
            raise ValueError(f"Could not read image: {image_path_or_array}")
    else:
        img = image_path_or_array

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    # A fixed, lenient threshold (not Otsu) is used deliberately: Otsu
    # picks one global cutoff for the whole image, which works fine for
    # pure black-on-white text but — verified directly — is too strict to
    # catch light-gray placeholder text (a very common real style for
    # wireframe placeholder copy, e.g. "Name" or "Email Address" drawn in
    # a mid-gray) as foreground at all once a much darker box border is
    # also in frame; Otsu's single cutoff sits between the two, erasing
    # the lighter text before OCR ever sees it. 200 catches anything
    # darker than a light gray as foreground while still cleanly excluding
    # near-white background and antialiasing fringe.
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    cleaned = _remove_border_lines(thresh)

    data = _image_data(cleaned)

    regions: list[TextRegion] = []
    for i in range(len(data["text"])):
        word = data["text"][i].strip()
        conf = float(data["conf"][i])
        if not word or conf < min_confidence:
            continue
        regions.append(
            TextRegion(
                text=_sanitize_ocr_text(word),
                x=float(data["left"][i]),
                y=float(data["top"][i]),
                width=float(data["width"][i]),
                height=float(data["height"][i]),
                confidence=conf,
            )
        )
    return regions


def _contains_center(element: dict, region: TextRegion, margin: float = 4.0) -> bool:
    """True if the word's center point falls within the element's
    bounding box (with a small margin) — the real signal that a word
    visually belongs to that element, since wireframe label/placeholder
    text is drawn inside the element it labels in the overwhelming
    majority of real UI conventions."""
    cx, cy = region.center
    return (
        element["x"] - margin <= cx <= element["x"] + element["width"] + margin
        and element["y"] - margin <= cy <= element["y"] + element["height"] + margin
    )


def _distance_to_element(region: TextRegion, element: dict) -> float:
    """Center-to-center distance, used only as a fallback for words that
    fall outside every element's bounding box (e.g. a label sitting just
    above an input box rather than inside it)."""
    rcx, rcy = region.center
    ecx = element["x"] + element["width"] / 2
    ecy = element["y"] + element["height"] / 2
    return ((rcx - ecx) ** 2 + (rcy - ecy) ** 2) ** 0.5


def attach_labels(elements: list[dict], text_regions: list[TextRegion], max_distance: float = 40.0) -> list[dict]:
    """
    Groups OCR words into a label per UI element, using each element's
    OWN bounding box as the grouping boundary rather than a generic
    pixel-gap heuristic — this is what correctly separates "Login" and
    "Sign Up" into two different buttons' labels even when they sit
    close together, while still combining "Email" and "Address" into one
    phrase for a single wide input field.

    Pass 1: every word whose center falls inside an element's bbox is
    claimed by that element (sorted left-to-right, joined with spaces).
    Pass 2: any element that got no words this way falls back to the
    single nearest unclaimed word within `max_distance` pixels (a label
    floating just above/beside its element rather than inside it).

    Returns a new list of elements, each with an added "label" key (the
    matched OCR text, or None if nothing matched).
    """
    elements = [dict(e) for e in elements]
    for e in elements:
        e["label"] = None

    unclaimed = list(text_regions)

    # Pass 1: direct containment, smallest-area element wins a given word
    # (so a word inside a button that's itself inside a larger container
    # attaches to the button, not the container).
    # Macro regions must not absorb all nested copy into one accidental label.
    # Containers express layout, not an interactive text target. Letting a
    # page/section-sized contour claim every word inside it produces a
    # flattened page-wide OCR body. Standalone OCR remains region-aware text;
    # controls still receive contained OCR through this leaf-only list.
    labelable = [e for e in elements if not e.get("role") and e.get("type") not in {"container", "region"}]
    by_area = sorted(labelable, key=lambda e: e["width"] * e["height"])
    claimed_words: dict[int, list[TextRegion]] = {id(e): [] for e in elements}
    for region in text_regions:
        for e in by_area:
            if _contains_center(e, region):
                claimed_words[id(e)].append(region)
                if region in unclaimed:
                    unclaimed.remove(region)
                break

    for e in labelable:
        words = claimed_words[id(e)]
        if words:
            words.sort(key=lambda r: r.x)
            e["label"] = " ".join(r.text for r in words)

    # Pass 2: proximity fallback for elements that got nothing in pass 1.
    for e in labelable:
        if e["label"] is not None:
            continue
        best_region, best_dist = None, max_distance
        for region in unclaimed:
            dist = _distance_to_element(region, e)
            if dist < best_dist:
                best_region, best_dist = region, dist
        if best_region is not None:
            e["label"] = best_region.text
            unclaimed.remove(best_region)

    return elements


def extract_ocr_document(image: np.ndarray, min_confidence: int = MIN_CONFIDENCE) -> dict:
    """Evidence-oriented OCR pass used by both production diagnostics and fixtures.

    It preserves word hierarchy and derives conservative line/paragraph groups.
    An original and enlarged normalized pass are attempted; near-duplicate words
    are collapsed in favor of the higher-confidence reading.
    """
    status = configure_tesseract()
    h, w = image.shape[:2]
    document = {"status": status, "originalDimensions": {"width": w, "height": h}, "normalizedDimensions": {"width": w, "height": h}, "passes": [], "words": [], "lines": [], "groups": [], "warnings": []}
    if not status["enabled"]:
        document["warnings"].append(status["reason"])
        return document
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    variants = [("normalized-psm6", _remove_border_lines(cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)[1]), "--psm 6"), ("upscaled-psm11", cv2.resize(gray, None, fx=1.75, fy=1.75, interpolation=cv2.INTER_CUBIC), "--psm 11")]
    raw_words = []
    for pass_name, variant, config in variants:
        try:
            data = _image_data(variant, config=config)
            scale = 1.75 if pass_name.startswith("upscaled") else 1.0
            found = 0
            for index, text in enumerate(data["text"]):
                text = _sanitize_ocr_text(text.strip())
                try: confidence = float(data["conf"][index])
                except (ValueError, TypeError): confidence = -1
                if not text or confidence < min_confidence:
                    continue
                word = {"text": text, "confidence": confidence, "x": data["left"][index] / scale, "y": data["top"][index] / scale, "width": data["width"][index] / scale, "height": data["height"][index] / scale, "page": data.get("page_num", [0])[index], "block": data.get("block_num", [0])[index], "paragraph": data.get("par_num", [0])[index], "line": data.get("line_num", [0])[index], "word": data.get("word_num", [0])[index], "pass": pass_name}
                raw_words.append(word); found += 1
            document["passes"].append({"name": pass_name, "config": config, "wordsFound": found})
        except Exception as exc:
            document["passes"].append({"name": pass_name, "config": config, "error": str(exc), "wordsFound": 0})
            document["warnings"].append(f"{pass_name}: {exc}")
    words = []
    for candidate in sorted(raw_words, key=lambda item: -item["confidence"]):
        cx, cy = candidate["x"] + candidate["width"] / 2, candidate["y"] + candidate["height"] / 2
        if any(item["text"].lower() == candidate["text"].lower() and abs((item["x"] + item["width"] / 2) - cx) < 12 and abs((item["y"] + item["height"] / 2) - cy) < 12 for item in words):
            continue
        candidate["normalizedBounds"] = {"x": round(candidate["x"] / w, 4), "y": round(candidate["y"] / h, 4), "width": round(candidate["width"] / w, 4), "height": round(candidate["height"] / h, 4)}
        words.append(candidate)
    line_buckets: dict[tuple, list[dict]] = {}
    for word in words: line_buckets.setdefault((word["pass"], word["page"], word["block"], word["paragraph"], word["line"]), []).append(word)
    for key, items in line_buckets.items():
        items.sort(key=lambda item: item["x"]); x1=min(item["x"] for item in items); y1=min(item["y"] for item in items); x2=max(item["x"]+item["width"] for item in items); y2=max(item["y"]+item["height"] for item in items)
        document["lines"].append({"text":" ".join(item["text"] for item in items),"confidence":round(sum(item["confidence"] for item in items)/len(items),2),"x":x1,"y":y1,"width":x2-x1,"height":y2-y1,"pass":key[0],"evidence":[item["word"] for item in items]})
    group_buckets: dict[tuple, list[dict]] = {}
    for line in document["lines"]: group_buckets.setdefault((line["pass"], round(line["x"] / 120), round(line["y"] / 180)), []).append(line)
    for key, items in group_buckets.items():
        items.sort(key=lambda item: item["y"]); x1=min(item["x"] for item in items); y1=min(item["y"] for item in items); x2=max(item["x"]+item["width"] for item in items); y2=max(item["y"]+item["height"] for item in items)
        document["groups"].append({"text":" ".join(item["text"] for item in items),"confidence":round(sum(item["confidence"] for item in items)/len(items),2),"x":x1,"y":y1,"width":x2-x1,"height":y2-y1,"pass":key[0],"lineCount":len(items)})
    document["words"] = words
    return document


def render_ocr_debug(image: np.ndarray, document: dict, output_path: str) -> None:
    """Fixture-only diagnostic overlay; normal UI never displays this artifact."""
    canvas = image.copy()
    for color, key in [((255, 180, 0), "words"), ((0, 255, 0), "lines"), ((255, 0, 255), "groups")]:
        for item in document.get(key, []):
            x, y, width, height = map(int, (item["x"], item["y"], item["width"], item["height"]))
            cv2.rectangle(canvas, (x, y), (x + width, y + height), color, 1)
            if key != "words" or len(document.get("words", [])) < 30:
                cv2.putText(canvas, item["text"][:32], (x, max(12, y - 2)), cv2.FONT_HERSHEY_SIMPLEX, .35, color, 1, cv2.LINE_AA)
    cv2.imwrite(output_path, canvas)
