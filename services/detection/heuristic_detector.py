"""
Heuristic detector — a real, working implementation of Pipeline Step 2 that
requires NO trained model, NO network, and NO GPU. It runs OpenCV contour
detection on the actual preprocessed image and classifies each detected
region by shape heuristics (aspect ratio, fill density, size).

Why this exists: `detect.py` implements the spec's real target (a
fine-tuned YOLOv8 model), but fine-tuning YOLOv8 requires a labeled
wireframe dataset and a training run neither of which exist yet. Without
this module, the pipeline could only ever be demoed against hand-typed
fake detections — it would never actually look at the wireframe you upload.
This module is what makes "the generated code reflects the wireframe you
actually attach" true today. `sidecar.py` uses this by default; swap in
`Detector` (YOLOv8) from `detect.py` once you have fine-tuned weights —
both produce the same `Detection` list shape, so nothing downstream needs
to change.

Classification heuristics (deliberately simple and explainable, not a
learned model):
  - very wide, short, low-fill-ratio rectangle with rounded/sharp border  -> button
  - small dense cluster of thin dark strokes                              -> text
  - large rectangle mostly enclosing other detected regions                -> container
  - large rectangle with high fill variance (photo-like) and no strokes   -> image
  - small square, roughly 1:1 aspect, near text                          -> icon
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import cv2
import numpy as np

MIN_AREA = 200            # ignore noise-sized contours
MAX_AREA_FRACTION = 0.92  # ignore a contour that's basically the whole image
MIN_ACCEPTED_CONFIDENCE = 0.58  # omit ambiguous micro-detections rather than invent UI
TEXT_LINE_HEIGHT_MAX = 34 # px, in a 1024-wide normalized image — short + wide -> likely a text line
CONTAINER_MIN_CHILDREN = 1


@dataclass
class Detection:
    label: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float
    role: str | None = None

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    def to_dict(self) -> dict:
        return asdict(self)


def _classify_region(gray_img: np.ndarray, x: int, y: int, w: int, h: int, fill_ratio: float) -> tuple[str, float]:
    """Size/fill classification plus the two pixel-level corrections. Used for
    raw contours and for merged fragment groups alike, so they can't disagree."""
    label, confidence = _classify((x, y, w, h), gray_img.shape[:2], fill_ratio)
    # A short, wide outlined control (e.g. a 100x30 "Login" box) matches the
    # text-line shape rule; a closed rectangular border says it's a control.
    # An *empty* thin outlined bar is the wireframe convention for a line of
    # text, so the box must also contain something (its label).
    if label == "text" and 20 <= h <= 90 and has_rect_outline(gray_img, x, y, w, h) and _interior_ink(gray_img, x, y, w, h) >= 0.02:
        return ("input", 0.70) if w / max(h, 1) > 4.0 and fill_ratio < 0.25 else ("button", 0.66)
    # The X-crossed box is the universal image-placeholder glyph at any size;
    # size rules alone would call a large one a container.
    if label == "container" and _is_x_placeholder(gray_img, x, y, w, h):
        return "image", 0.75
    return label, confidence


def _classify(rect: tuple[int, int, int, int], img_shape: tuple[int, int], fill_ratio: float) -> tuple[str, float]:
    x, y, w, h = rect
    img_h, img_w = img_shape
    aspect = w / max(h, 1)

    # container: large box, roomy enough to hold other elements
    if w > img_w * 0.35 and h > img_h * 0.12:
        return "container", 0.75

    # wireframe card / media placeholder (e.g. 3-column service cards, map placeholder, media box).
    # Cards and media are taller than controls: at h > 45 this rule captured
    # ordinary ~120x40 buttons (≈124x46 after dilation) and labelled them images.
    if w > img_w * 0.10 and h > 60 and 0.5 <= aspect <= 2.8:
        return "image", 0.72

    # text line: short and wide, low fill (mostly whitespace + thin strokes)
    if h <= TEXT_LINE_HEIGHT_MAX and aspect > 2.2 and fill_ratio < 0.35:
        return "text", 0.68

    # Small squares are frequently OCR/edge artefacts. Do not promote them
    # to icons without a stronger, compact visual signal.
    if 0.82 <= aspect <= 1.22 and 16 <= w < 42 and 16 <= h < 42 and fill_ratio > 0.18:
        return "icon", 0.68

    # filled call-to-action: a solid, wide, control-height strip (e.g. a dark
    # "Login" bar) is a primary button, not a photo block
    if fill_ratio > 0.55 and aspect >= 2.5 and 20 <= h <= 90:
        return "button", 0.70

    # image: large area, high fill ratio (photo-like block), not text-shaped
    if fill_ratio > 0.55 and w > 60 and h > 60:
        return "image", 0.70

    # input: long, short box (very low fill, empty input field). Fields are
    # elongated (typically 5:1 and wider); compact outlined boxes (~3:1) are
    # buttons, which the next rule handles.
    if aspect > 4.0 and 18 <= h <= 55 and fill_ratio < 0.25:
        return "input", 0.70

    # button: moderately wide rectangle, low-to-mid fill, sits on its own
    if 1.2 <= aspect <= 6 and 20 <= h <= 90:
        return "button", 0.65

    # general container / card component
    if w > 50 and h > 35:
        return "container", 0.62

    return "container", 0.50


def detect_from_array(gray_uint8: np.ndarray, min_area: int = MIN_AREA) -> list[Detection]:
    """
    Runs contour detection on a single-channel uint8 image and returns
    normalized Detection objects. This is the real, callable implementation
    — `detect_from_path` and the CLI wrapper are thin wrappers around this.
    """
    img_h, img_w = gray_uint8.shape[:2]
    max_area = img_h * img_w * MAX_AREA_FRACTION

    # Edge-based binary map picks up wireframe strokes (borders, text) well
    # regardless of whether the source is a clean digital wireframe or a
    # photographed hand sketch.
    blurred = cv2.GaussianBlur(gray_uint8, (3, 3), 0)
    edges = cv2.Canny(blurred, 40, 120)
    # Adaptive threshold recovers faint pencil/scan strokes; combining it
    # with Canny preserves sharp digital outlines. Opening removes isolated
    # speckle before contours become components.
    adaptive = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8)
    adaptive = cv2.morphologyEx(adaptive, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    edges = cv2.bitwise_or(edges, adaptive)
    dilated = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(dilated, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    detections: list[Detection] = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area or area > max_area:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if w < 8 or h < 8:
            continue

        roi = gray_uint8[y : y + h, x : x + w]
        # fill_ratio: fraction of the box that's "ink" (dark pixels) — a
        # rough proxy for whether a region is a solid/photo block vs. an
        # outline/whitespace-heavy widget. Uses a FIXED darkness threshold
        # rather than a fresh Otsu computed on just this small ROI — Otsu
        # assumes a roughly bimodal histogram, and degenerates badly on a
        # near-uniform region (verified directly: a mostly-white input box
        # with only a thin 2px border produced fill_ratio ≈ 0.91 via local
        # Otsu, misclassifying nearly the entire white interior as "ink"
        # and causing the box to fall through to the generic "container"
        # fallback instead of being recognized as an input field).
        if roi.size == 0:
            continue
        fill_ratio = float(np.count_nonzero(roi < 200)) / float(roi.size)

        label, confidence = _classify_region(gray_uint8, x, y, w, h, fill_ratio)
        detections.append(Detection(label, confidence, float(x), float(y), float(x + w), float(y + h)))


    # Absorb X-glyph stroke fragments before NMS: a triangle fragment overlaps
    # its placeholder enough (IoU ~0.43) to knock the placeholder out otherwise.
    detections = _absorb_placeholder_strokes(detections, gray_uint8)
    deduped = _drop_near_duplicate_boxes(detections)
    merged = _absorb_placeholder_strokes(_merge_shape_fragments(deduped, gray_uint8), gray_uint8)
    # The page skeleton organises real content; it is never evidence on its
    # own. With no accepted leaf element, return nothing rather than an
    # invented page/main scaffold (a blank upload must fail as "nothing found").
    if not any(d.confidence >= MIN_ACCEPTED_CONFIDENCE for d in merged):
        return []
    macro_regions = _detect_macro_regions(gray_uint8)
    return _refine_layout_candidates(merged, img_shape=(img_h, img_w), macro_regions=macro_regions)


def _interior_ink(gray_img: np.ndarray, x: int, y: int, w: int, h: int, inset: int = 4) -> float:
    """Dark-pixel fraction inside the box, excluding a border band."""
    roi = gray_img[y + inset : y + h - inset, x + inset : x + w - inset]
    return float((roi < 200).mean()) if roi.size else 0.0


def has_rect_outline(gray_img: np.ndarray, x: int, y: int, w: int, h: int, coverage: float = 0.85) -> bool:
    """True when all four sides of the box carry a (nearly) continuous dark
    stroke within 3 px either side of each edge — the signature of a drawn
    control border (contours often trace the stroke's inner edge, so the
    stroke can sit just outside the box). Text lines touch their bounding box
    only intermittently."""
    if w < 12 or h < 12:
        return False
    t = 3
    img_h, img_w = gray_img.shape[:2]
    x0, y0 = max(0, x - t), max(0, y - t)
    x1, y1 = min(img_w, x + w + t), min(img_h, y + h + t)
    ink = gray_img[y0:y1, x0:x1] < 200
    band = 2 * t
    inner = ink[band:-band, band:-band] if ink.shape[0] > 2 * band and ink.shape[1] > 2 * band else ink
    sides = (
        ink[:band, band:-band].any(axis=0), ink[-band:, band:-band].any(axis=0),
        ink[band:-band, :band].any(axis=1), ink[band:-band, -band:].any(axis=1),
    )
    # A closed border, and not a solid block (the interior must be mostly empty).
    return all(side.size and side.mean() >= coverage for side in sides) and inner.mean() < 0.5


def _absorb_placeholder_strokes(detections: list[Detection], gray_img: np.ndarray) -> list[Detection]:
    """An X-box's diagonals split its interior into triangle-shaped contours.
    Those fragments are strokes of the placeholder glyph, not UI: drop any
    detection lying inside an X-box image."""
    placeholders = [
        d for d in detections
        if d.label == "image" and _is_x_placeholder(gray_img, int(d.x1), int(d.y1), int(d.width), int(d.height))
    ]
    if not placeholders:
        return detections
    def inside(d: Detection, p: Detection) -> bool:
        return d is not p and d.x1 >= p.x1 - 2 and d.y1 >= p.y1 - 2 and d.x2 <= p.x2 + 2 and d.y2 <= p.y2 + 2
    return [d for d in detections if not any(inside(d, p) for p in placeholders)]


def _has_central_gutter(ink_band: np.ndarray) -> bool:
    """True when the band splits into two columns: somewhere in the middle
    fifth there is a near-empty vertical strip. Ink on both halves alone is
    not enough (a single centred box has that too)."""
    if ink_band.size == 0:
        return False
    w = ink_band.shape[1]
    columns = ink_band.mean(axis=0)
    sides = np.concatenate([columns[: int(w * .4)], columns[int(w * .6):]]).mean()
    middle = columns[int(w * .4): int(w * .6)]
    if sides <= 0 or middle.size < 5:
        return False
    # smallest 5-column run in the middle band, relative to side density
    gutter = np.convolve(middle, np.ones(5) / 5, mode="valid").min()
    return gutter < sides * 0.15


def _detect_macro_regions(gray_img: np.ndarray) -> list[Detection]:
    """Macro pass: establish a page skeleton before examining leaf boxes.
    The regions are intentionally structural (page/header/main/section), so
    uncertain semantics never erase a visually obvious full-page layout."""
    h, w = gray_img.shape[:2]
    ink = (gray_img < 215).astype(np.uint8)
    y_density = ink.mean(axis=1)
    top = max(72, int(h * 0.13)); bottom = int(h * 0.86)
    regions = [Detection("container", .98, 0, 0, float(w), float(h), "page")]
    if y_density[:top].mean() > 0.008:
        regions.append(Detection("container", .9, 0, 0, float(w), float(top), "header"))
    if bottom > top:
        regions.append(Detection("container", .94, 0, float(top), float(w), float(bottom), "main"))
    if y_density[bottom:].mean() > 0.006:
        regions.append(Detection("container", .82, 0, float(bottom), float(w), float(h), "footer"))
    # A balanced main-content density on both sides is strong evidence of a
    # two-column/product-detail skeleton. Preserve it even if leaf CV is weak.
    if bottom > top and w >= 500:
        left = ink[top:bottom, :w // 2].mean(); right = ink[top:bottom, w // 2:].mean()
        related_start = int(top + (bottom - top) * .70)
        if left > .006 and right > .006 and _has_central_gutter(ink[top:related_start]):
            mid = w * .52
            # Dense lower content after a broad main split is commonly a
            # recommendations/card strip. Segment it independently so it
            # does not disappear inside the product detail region.
            has_related = ink[related_start:bottom].mean() > .012
            upper_bottom = related_start if has_related else bottom
            regions.extend([
                Detection("container", .84, 0, float(top), mid, float(upper_bottom), "gallery"),
                Detection("container", .84, mid, float(top), float(w), float(upper_bottom), "product-detail"),
            ])
            if has_related:
                regions.append(Detection("container", .78, 0, float(related_start), float(w), float(bottom), "related-products"))
    return regions


def _refine_layout_candidates(detections: list[Detection], img_shape: tuple[int, int], macro_regions: list[Detection] | None = None) -> list[Detection]:
    """Second (hierarchical) detector pass: retain reliable regions first,
    then permit a low-confidence enclosing container only when it organizes
    two or more accepted children. This sharply reduces noisy tiny boxes."""
    accepted = [d for d in detections if d.confidence >= MIN_ACCEPTED_CONFIDENCE]
    for candidate in detections:
        if candidate in accepted or candidate.label != "container":
            continue
        contained = sum(
            1 for child in accepted
            if child is not candidate and child.x1 >= candidate.x1 and child.y1 >= candidate.y1
            and child.x2 <= candidate.x2 and child.y2 <= candidate.y2
        )
        if contained >= 2:
            accepted.append(Detection("container", max(candidate.confidence, 0.6), candidate.x1, candidate.y1, candidate.x2, candidate.y2))
    # Stable reading order helps downstream row/group inference and makes
    # responses deterministic for the same source image.
    # Macro regions deliberately overlap their children and must never be
    # NMS-dropped; they are hierarchy evidence, not duplicate detections.
    regions = macro_regions or []
    # Recovery pass: macro geometry is trustworthy enough to retain the
    # dominant media block even if internal strokes fragmented its contour.
    # This prevents a page-sized gallery from vanishing merely because its
    # image placeholder used a low-contrast outline.
    for region in regions:
        if region.role != "gallery":
            continue
        has_media = any(d.label == "image" and d.x1 >= region.x1 and d.y1 >= region.y1 and d.x2 <= region.x2 and d.y2 <= region.y2 for d in accepted)
        if not has_media:
            inset_x, inset_y = region.width * .04, region.height * .05
            accepted.append(Detection("image", .7, region.x1 + inset_x, region.y1 + inset_y, region.x2 - inset_x, region.y2 - inset_y, "media"))
    return sorted(regions + _drop_near_duplicate_boxes(accepted), key=lambda d: (d.y1, d.x1, -d.confidence))


def _iou(a: Detection, b: Detection) -> float:
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = a.width * a.height + b.width * b.height - inter
    return inter / union if union > 0 else 0.0


def _drop_near_duplicate_boxes(detections: list[Detection], iou_threshold: float = 0.4) -> list[Detection]:
    """Simple NMS-equivalent: Canny + dilate very commonly produces two
    concentric contours (inner edge + outer edge) for a single visual
    stroke — e.g. a checkbox's outline gets detected as both an inner and
    outer rectangle a few pixels apart. These don't overlap enough to hit a
    strict 0.7 IoU threshold but are visually the same element, and if left
    in, the smaller one ends up nested *inside* the larger one by the
    schema builder's containment check — which the compiler doesn't expect
    for leaf element types. 0.4 catches this case without merging genuinely
    separate adjacent elements (verified against services/detection/test_heuristic_detector.py)."""
    kept: list[Detection] = []
    for d in sorted(detections, key=lambda d: -d.confidence):
        if not any(_iou(d, k) > iou_threshold for k in kept):
            kept.append(d)
    return kept


def _box_area(d: Detection) -> float:
    return d.width * d.height


def _overlap_area(a: Detection, b: Detection) -> float:
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    return (ix2 - ix1) * (iy2 - iy1)


def _has_diagonal_cross(gray_img: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
    """
    Detects the classic "image placeholder" wireframe glyph — a box with
    an X drawn corner-to-corner — directly, via Hough line detection
    looking for two long diagonal lines near ±45°. This exists because
    generic size/fill heuristics genuinely can't tell an X-box apart from
    a large, mostly-empty plain container: both have very low fill_ratio
    (verified directly — an X-box's diagonals contribute under 2% fill,
    indistinguishable from container "noise" on that signal alone).
    Explicit diagonal detection is a real, specific signal a plain
    rectangular container's border (all horizontal/vertical lines) will
    never trigger.
    """
    if w < 20 or h < 20:
        return False
    roi = gray_img[y : y + h, x : x + w]
    edges = cv2.Canny(roi, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30, minLineLength=int(min(w, h) * 0.5), maxLineGap=10)
    if lines is None:
        return False
    diag_count = 0
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        # near 45 or 135 degrees (accounting for the two diagonal directions)
        if 30 < angle < 60 or 120 < angle < 150:
            diag_count += 1
    return diag_count >= 2  # both diagonals of the X present


def _is_x_placeholder(gray_img: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
    """Stricter than _has_diagonal_cross: the box's *own* corner-to-corner X.
    Both diagonals must span most of the box and cross near its centre, so a
    section containing X-crossed cards, or a glyph like "A" (strokes meet at
    the apex), does not qualify."""
    if w < 40 or h < 40:
        return False
    roi = gray_img[y : y + h, x : x + w]
    edges = cv2.Canny(roi, 50, 150)
    diagonal = float(np.hypot(w, h))
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30, minLineLength=int(diagonal * 0.6), maxLineGap=12)
    if lines is None:
        return False
    rising, falling = [], []
    for line in lines:
        x1, y1, x2, y2 = (float(v) for v in line[0])
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
        if 20 < angle < 70:
            falling.append((x1, y1, x2, y2))
        elif 110 < angle < 160:
            rising.append((x1, y1, x2, y2))
    for a in falling:
        for b in rising:
            (x1, y1, x2, y2), (x3, y3, x4, y4) = a, b
            denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(denom) < 1e-6:
                continue
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
            ix, iy = x1 + t * (x2 - x1), y1 + t * (y2 - y1)
            if abs(ix - w / 2) < w * 0.2 and abs(iy - h / 2) < h * 0.2:
                return True
    return False


def _merge_shape_fragments(
    detections: list[Detection],
    gray_img: np.ndarray,
    area_efficiency_threshold: float = 0.8,
) -> list[Detection]:
    """
    Collapses fragment detections back into single larger shapes (e.g. an image
    placeholder with crossing diagonals) while preserving parent containers and
    separate sibling widgets.
    """
    leafs = [d for d in detections if d.label != "container"]
    containers = [d for d in detections if d.label == "container"]
    n = len(leafs)
    if n <= 1:
        return detections

    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(n):
        for j in range(i + 1, n):
            a, b = leafs[i], leafs[j]
            area_a, area_b = _box_area(a), _box_area(b)
            # Only merge fragments of comparable size (ratio < 3.5) that heavily overlap
            if min(area_a, area_b) > 0 and max(area_a, area_b) / min(area_a, area_b) < 3.5:
                overlap = _overlap_area(a, b)
                if overlap / min(area_a, area_b) > 0.4:
                    union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    img_h, img_w = gray_img.shape[:2]
    result: list[Detection] = list(containers)
    for member_idxs in groups.values():
        members = [leafs[i] for i in member_idxs]
        if len(members) == 1:
            result.append(members[0])
            continue

        x1 = min(d.x1 for d in members)
        y1 = min(d.y1 for d in members)
        x2 = max(d.x2 for d in members)
        y2 = max(d.y2 for d in members)
        union_area = (x2 - x1) * (y2 - y1)
        summed_area = sum(_box_area(d) for d in members)

        if union_area > 0 and (summed_area / union_area) >= area_efficiency_threshold:
            x, y, w, h = int(x1), int(y1), int(x2 - x1), int(y2 - y1)
            roi = gray_img[y : y + h, x : x + w]
            fill_ratio = float(np.count_nonzero(roi < 200)) / float(roi.size) if roi.size else 0.0
            if _has_diagonal_cross(gray_img, x, y, w, h):
                result.append(Detection("image", 0.75, x1, y1, x2, y2))
            else:
                label, confidence = _classify_region(gray_img, x, y, w, h, fill_ratio)
                result.append(Detection(label, confidence, x1, y1, x2, y2))
        else:
            # Check if majority are images
            result.append(Detection("image", 0.75, x1, y1, x2, y2))

    return result


def detect_from_path(image_path: str, min_area: int = MIN_AREA) -> list[Detection]:
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")
    return detect_from_array(img, min_area=min_area)


def to_schema_input(detections: list[Detection]) -> list[dict]:
    return [
        {
            "type": d.label,
            "confidence": d.confidence,
            "x": d.x1,
            "y": d.y1,
            "width": d.width,
            "height": d.height,
            "role": d.role,
        }
        for d in detections
    ]
