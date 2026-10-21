"""
Tests for heuristic_detector.py — the real, model-free detector.
Uses the real fixture image plus a couple of hand-drawn synthetic cases
so the classification heuristics are checked in isolation from the fixture's
specific layout.
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from heuristic_detector import detect_from_array, detect_from_path, to_schema_input

FIXTURE = Path(__file__).resolve().parents[1] / "preprocessing" / "fixtures" / "simple_layout.png"

passed, failed = 0, 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


def test_detects_something_on_real_fixture():
    dets = detect_from_path(str(FIXTURE))
    assert len(dets) > 0, "should detect at least one element on a real wireframe"


def test_detects_the_two_nav_buttons_in_fixture():
    dets = detect_from_path(str(FIXTURE))
    # the fixture draws two ~120x40 outlined rectangles at roughly x=900 and x=1040
    buttonish = [d for d in dets if d.label == "button" and d.width > 80 and 20 <= d.height <= 60]
    assert len(buttonish) >= 2, f"expected >=2 button-shaped detections, got {[(d.x1, d.width, d.height) for d in buttonish]}"


def test_detects_the_large_text_block_container():
    dets = detect_from_path(str(FIXTURE))
    large_containers = [d for d in dets if d.label == "container" and d.width > 500]
    assert len(large_containers) >= 1, "the bordered text block (1100x250) should register as a container"


def test_to_schema_input_shape_matches_detection_fields():
    dets = detect_from_path(str(FIXTURE))
    schema_input = to_schema_input(dets)
    assert all({"type", "confidence", "x", "y", "width", "height"} <= set(d.keys()) for d in schema_input)


def _blank_canvas(w=800, h=600):
    return np.full((h, w), 255, dtype=np.uint8)


def test_classifies_a_wide_short_outlined_box_as_button():
    img = _blank_canvas()
    cv2.rectangle(img, (100, 100), (220, 140), 0, 2)  # 120x40 outline, thin stroke
    dets = detect_from_array(img)
    labels = [d.label for d in dets]
    assert "button" in labels, f"expected a button classification, got {labels}"


def test_classifies_a_large_filled_block_as_image():
    img = _blank_canvas()
    cv2.rectangle(img, (50, 50), (250, 250), 60, -1)  # solid filled block, photo-like
    dets = detect_from_array(img)
    labels = [d.label for d in dets]
    assert "image" in labels, f"expected an image classification, got {labels}"


def test_empty_canvas_returns_no_detections():
    img = _blank_canvas()
    dets = detect_from_array(img)
    assert dets == []


def test_near_duplicate_boxes_are_deduplicated():
    img = _blank_canvas()
    cv2.rectangle(img, (100, 100), (300, 160), 0, 2)
    cv2.rectangle(img, (101, 101), (299, 159), 0, 1)  # near-identical inner outline (common Canny artifact)
    dets = detect_from_array(img)
    # should collapse to ~1 detection for this single visual box, not 2+.
    # Page-skeleton regions (role set: page/main/header/...) are hierarchy
    # evidence added after this test was written and are never NMS-dropped by
    # design, so only leaf boxes are counted here.
    overlapping = [d for d in dets if d.width > 150 and d.role is None]
    assert len(overlapping) <= 1, f"expected near-duplicate boxes deduplicated, got {len(overlapping)}"


def test_regression_mostly_empty_box_classifies_as_input_not_container():
    """A real bug found via user report: fill_ratio was computed with a
    fresh Otsu threshold on each small ROI, which degenerates badly on a
    near-uniform region (a wide, mostly-white input box with only a thin
    border) — it misclassified ~91% of the white interior as "ink",
    pushing the box to the generic "container" fallback instead of
    "input". Fixed by using a fixed darkness threshold instead of a
    per-ROI Otsu recomputation. Canvas is sized like a realistic full
    wireframe (not just the input box itself) so the box doesn't trip the
    unrelated container-vs-widget *relative-size* heuristic."""
    img = _blank_canvas(w=1200, h=900)
    cv2.rectangle(img, (60, 60), (900, 118), 0, 2)  # wide, short, thin-bordered box — classic input field shape
    dets = detect_from_array(img)
    labels = [d.label for d in dets]
    assert "input" in labels, f"expected an input classification, got {labels}"


def test_regression_x_crossed_box_merges_into_one_image_element():
    """A real bug found via user report: an image-placeholder box with a
    diagonal "X" through it (drawn as a rectangle + 2 corner-to-corner
    lines — a near-universal wireframe convention) produced FOUR separate
    fragment detections (the diagonals create their own closed contour
    regions) instead of one "image" element. Fixed with connected-
    component fragment merging + explicit diagonal-line detection to
    distinguish an X-box from a plain empty container (which can't be
    told apart by size/fill_ratio alone — both are ~2% fill)."""
    img = _blank_canvas(w=500, h=500)
    cv2.rectangle(img, (100, 100), (400, 400), 0, 2)
    cv2.line(img, (100, 100), (400, 400), 0, 1, cv2.LINE_AA)
    cv2.line(img, (400, 100), (100, 400), 0, 1, cv2.LINE_AA)
    dets = detect_from_array(img)
    image_dets = [d for d in dets if d.label == "image" and d.width > 200]
    assert len(image_dets) == 1, f"expected exactly one merged image detection, got: {[(d.label, d.width, d.height) for d in dets]}"


def test_regression_button_with_internal_text_glyphs_stays_a_button():
    """Companion to the X-box fix above: fragment-merging must NOT
    hardcode every merged group as "image" — a button whose interior
    label-text glyph strokes get contour-detected as extra fragments
    (when not pre-masked by OCR) needs to merge back into "button" based
    on its own real aspect ratio/fill, not get force-relabeled. This was
    a real regression caught while fixing the X-box case: buttons briefly
    started misclassifying as "image" too. Canvas is sized like a
    realistic full wireframe so the button doesn't trip the unrelated
    container-vs-widget relative-size heuristic."""
    img = _blank_canvas(w=1200, h=900)
    cv2.rectangle(img, (60, 60), (260, 120), 0, 2)
    cv2.putText(img, "Login", (90, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, 0, 2, cv2.LINE_AA)
    dets = detect_from_array(img)
    labels = [d.label for d in dets]
    assert "button" in labels, f"expected a button classification to survive, got {labels}"
    assert "image" not in labels, f"button with internal text should not be relabeled as image, got {labels}"


if __name__ == "__main__":
    check("test_detects_something_on_real_fixture", test_detects_something_on_real_fixture)
    check("test_detects_the_two_nav_buttons_in_fixture", test_detects_the_two_nav_buttons_in_fixture)
    check("test_detects_the_large_text_block_container", test_detects_the_large_text_block_container)
    check("test_to_schema_input_shape_matches_detection_fields", test_to_schema_input_shape_matches_detection_fields)
    check("test_classifies_a_wide_short_outlined_box_as_button", test_classifies_a_wide_short_outlined_box_as_button)
    check("test_classifies_a_large_filled_block_as_image", test_classifies_a_large_filled_block_as_image)
    check("test_empty_canvas_returns_no_detections", test_empty_canvas_returns_no_detections)
    check("test_near_duplicate_boxes_are_deduplicated", test_near_duplicate_boxes_are_deduplicated)
    check("test_regression_mostly_empty_box_classifies_as_input_not_container", test_regression_mostly_empty_box_classifies_as_input_not_container)
    check("test_regression_x_crossed_box_merges_into_one_image_element", test_regression_x_crossed_box_merges_into_one_image_element)
    check("test_regression_button_with_internal_text_glyphs_stays_a_button", test_regression_button_with_internal_text_glyphs_stays_a_button)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
