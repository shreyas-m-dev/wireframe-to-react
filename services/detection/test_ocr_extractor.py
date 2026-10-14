"""
Tests for ocr_extractor.py — real Tesseract OCR, tested against real
images, not mocked. Covers the two real bugs found and fixed during
development: Otsu thresholding erasing light-gray placeholder text, and
box borders confusing Tesseract's layout analysis into returning nothing
at all for the whole image.
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ocr_extractor import TextRegion, attach_labels, extract_text_regions

FIXTURE = Path(__file__).resolve().parents[1] / "preprocessing" / "fixtures" / "labeled_form.png"

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


def test_extracts_all_four_labels_from_real_fixture():
    # extract_text_regions now returns individual WORDS (see module
    # docstring for why phrase-grouping moved to attach_labels, which uses
    # real element boundaries instead of a generic gap heuristic).
    regions = extract_text_regions(str(FIXTURE))
    texts = {r.text for r in regions}
    assert texts == {"Name", "Email", "Address", "Password", "Submit"}, texts


def test_extracted_regions_have_high_confidence():
    regions = extract_text_regions(str(FIXTURE))
    assert all(r.confidence > 80 for r in regions), [r.confidence for r in regions]


def test_bounding_boxes_are_roughly_correct():
    regions = extract_text_regions(str(FIXTURE))
    name_region = next(r for r in regions if r.text == "Name")
    # the "Name" field's box is drawn at (50,50)-(650,110) in the fixture;
    # the text itself should land inside that box, not somewhere random
    assert 50 <= name_region.x <= 650
    assert 50 <= name_region.y <= 110


def test_low_confidence_noise_is_filtered_out():
    regions = extract_text_regions(str(FIXTURE), min_confidence=999)
    assert regions == [], "an impossibly high confidence threshold should filter everything"


def test_regression_light_gray_text_is_still_readable():
    """Otsu auto-thresholding was erasing gray-140 placeholder text
    entirely (it sat on the 'background' side of Otsu's single global
    cutoff whenever a much-darker box border was also in the image) —
    this is exactly the fixture's failure mode before the fix."""
    img = np.full((200, 400, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (20, 20), (380, 90), (0, 0, 0), 2)
    cv2.putText(img, "Name", (40, 65), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (140, 140, 140), 2, cv2.LINE_AA)
    regions = extract_text_regions(img)
    assert any(r.text == "Name" for r in regions), [r.text for r in regions]


def test_attach_labels_matches_button_by_overlap():
    elements = [{"type": "button", "x": 87, "y": 350, "width": 117, "height": 28}]
    regions = extract_text_regions(str(FIXTURE))
    labeled = attach_labels(elements, regions)
    assert labeled[0]["label"] == "Submit"


def test_attach_labels_matches_input_field_by_overlap():
    # the "Name" field's outer box, matching the fixture's actual coordinates
    elements = [{"type": "input", "x": 50, "y": 50, "width": 600, "height": 60}]
    regions = extract_text_regions(str(FIXTURE))
    labeled = attach_labels(elements, regions)
    assert labeled[0]["label"] == "Name"


def test_attach_labels_leaves_unmatched_elements_with_none():
    elements = [{"type": "icon", "x": 900, "y": 900, "width": 10, "height": 10}]  # far from any text
    regions = extract_text_regions(str(FIXTURE))
    labeled = attach_labels(elements, regions)
    assert labeled[0]["label"] is None


def test_attach_labels_does_not_assign_the_same_text_to_two_elements():
    elements = [
        {"type": "button", "x": 87, "y": 350, "width": 117, "height": 28},
        {"type": "button", "x": 200, "y": 350, "width": 30, "height": 28},  # near the same text, but shouldn't double-claim it
    ]
    regions = extract_text_regions(str(FIXTURE))
    labeled = attach_labels(elements, regions)
    labels = [e["label"] for e in labeled]
    assert labels.count("Submit") <= 1, labels


def test_multi_word_labels_combine_into_one_phrase():
    # words are combined into one phrase by attach_labels, based on which
    # element's bounding box actually contains them — not by
    # extract_text_regions itself (see module docstring).
    elements = [{"type": "input", "x": 50, "y": 140, "width": 600, "height": 60}]  # the Email Address field
    regions = extract_text_regions(str(FIXTURE))
    labeled = attach_labels(elements, regions)
    assert labeled[0]["label"] == "Email Address", "should combine into one phrase, not split into 'Email' and 'Address'"


def test_two_adjacent_short_labels_stay_separate_not_merged():
    """REGRESSION: the earlier gap-heuristic version of this module merged
    two nearby-but-distinct button labels ("Login", "Sign Up" in a nav
    header) into one giant phrase and attached it to a single button,
    since Tesseract's line-grouping doesn't know about UI element
    boundaries. Element-boundary-based grouping fixes this by construction:
    each button's bbox only contains its own word(s)."""
    regions = [
        TextRegion(text="Login", x=100, y=20, width=40, height=15, confidence=95),
        TextRegion(text="Sign", x=160, y=20, width=35, height=15, confidence=95),
        TextRegion(text="Up", x=198, y=20, width=20, height=15, confidence=95),
    ]
    elements = [
        {"type": "button", "x": 95, "y": 15, "width": 55, "height": 25},   # contains "Login"
        {"type": "button", "x": 155, "y": 15, "width": 68, "height": 25},  # contains "Sign Up"
    ]
    labeled = attach_labels(elements, regions)
    assert labeled[0]["label"] == "Login"
    assert labeled[1]["label"] == "Sign Up"


if __name__ == "__main__":
    check("test_extracts_all_four_labels_from_real_fixture", test_extracts_all_four_labels_from_real_fixture)
    check("test_extracted_regions_have_high_confidence", test_extracted_regions_have_high_confidence)
    check("test_bounding_boxes_are_roughly_correct", test_bounding_boxes_are_roughly_correct)
    check("test_low_confidence_noise_is_filtered_out", test_low_confidence_noise_is_filtered_out)
    check("test_regression_light_gray_text_is_still_readable", test_regression_light_gray_text_is_still_readable)
    check("test_attach_labels_matches_button_by_overlap", test_attach_labels_matches_button_by_overlap)
    check("test_attach_labels_matches_input_field_by_overlap", test_attach_labels_matches_input_field_by_overlap)
    check("test_attach_labels_leaves_unmatched_elements_with_none", test_attach_labels_leaves_unmatched_elements_with_none)
    check("test_attach_labels_does_not_assign_the_same_text_to_two_elements", test_attach_labels_does_not_assign_the_same_text_to_two_elements)
    check("test_multi_word_labels_combine_into_one_phrase", test_multi_word_labels_combine_into_one_phrase)
    check("test_two_adjacent_short_labels_stay_separate_not_merged", test_two_adjacent_short_labels_stay_separate_not_merged)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
