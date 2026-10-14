"""
Standalone runner for environments without pytest installed. Mirrors
test_preprocess.py exactly — once you `pip install pytest` locally, just
run `pytest tests/` instead and delete this file.
"""

import sys
import traceback
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from preprocess import InvalidInputError, TARGET_SIZE, load_and_run, run_pipeline, validate_input

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"

passed, failed = 0, 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        traceback.print_exc()
        failed += 1


def test_valid_image_runs_end_to_end():
    result = load_and_run(FIXTURES / "simple_layout.png")
    assert result.pixel_matrix.dtype == np.float32
    assert result.pixel_matrix.shape == (TARGET_SIZE[1], TARGET_SIZE[0])
    assert result.pixel_matrix.min() >= 0.0
    assert result.pixel_matrix.max() <= 1.0
    assert result.original_shape == (800, 1200)


def test_rejects_corrupt_bytes():
    data = (FIXTURES / "corrupt.png").read_bytes()
    try:
        validate_input(data, "corrupt.png")
        raise AssertionError("expected InvalidInputError")
    except InvalidInputError as e:
        assert "could not be decoded" in str(e)


def test_rejects_wrong_extension():
    data = (FIXTURES / "simple_layout.png").read_bytes()
    try:
        validate_input(data, "wireframe.gif")
        raise AssertionError("expected InvalidInputError")
    except InvalidInputError as e:
        assert "extension" in str(e)


def test_rejects_too_small_image():
    data = (FIXTURES / "tiny.png").read_bytes()
    try:
        validate_input(data, "tiny.png")
        raise AssertionError("expected InvalidInputError")
    except InvalidInputError as e:
        assert "too small" in str(e)


def test_rejects_empty_file():
    try:
        validate_input(b"", "empty.png")
        raise AssertionError("expected InvalidInputError")
    except InvalidInputError as e:
        assert "Empty" in str(e)


def test_scale_factor_maps_back_to_original():
    result = load_and_run(FIXTURES / "simple_layout.png")
    x_scale, y_scale = result.scale_factor
    assert abs(x_scale - 1024 / 1200) < 1e-6
    assert abs(y_scale - 1024 / 800) < 1e-6


def test_aspect_ratio_warning_present_for_wide_image():
    result = load_and_run(FIXTURES / "simple_layout.png")
    assert any("Aspect ratio" in w for w in result.warnings)


def test_grayscale_output_is_single_channel():
    result = run_pipeline((FIXTURES / "simple_layout.png").read_bytes(), "simple_layout.png")
    assert result.pixel_matrix.ndim == 2


if __name__ == "__main__":
    check("test_valid_image_runs_end_to_end", test_valid_image_runs_end_to_end)
    check("test_rejects_corrupt_bytes", test_rejects_corrupt_bytes)
    check("test_rejects_wrong_extension", test_rejects_wrong_extension)
    check("test_rejects_too_small_image", test_rejects_too_small_image)
    check("test_rejects_empty_file", test_rejects_empty_file)
    check("test_scale_factor_maps_back_to_original", test_scale_factor_maps_back_to_original)
    check("test_aspect_ratio_warning_present_for_wide_image", test_aspect_ratio_warning_present_for_wide_image)
    check("test_grayscale_output_is_single_channel", test_grayscale_output_is_single_channel)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
