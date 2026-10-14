import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from preprocess import (
    InvalidInputError,
    TARGET_SIZE,
    load_and_run,
    run_pipeline,
    validate_input,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_valid_image_runs_end_to_end():
    result = load_and_run(FIXTURES / "simple_layout.png")
    assert result.pixel_matrix.dtype == np.float32
    assert result.pixel_matrix.shape == (683, 1024)  # aspect-preserving max canvas
    assert result.pixel_matrix.min() >= 0.0
    assert result.pixel_matrix.max() <= 1.0
    assert result.original_shape == (800, 1200)


def test_rejects_corrupt_bytes():
    data = (FIXTURES / "corrupt.png").read_bytes()
    with pytest.raises(InvalidInputError, match="could not be decoded"):
        validate_input(data, "corrupt.png")


def test_rejects_wrong_extension():
    data = (FIXTURES / "simple_layout.png").read_bytes()
    with pytest.raises(InvalidInputError, match="extension"):
        validate_input(data, "wireframe.gif")


def test_rejects_too_small_image():
    data = (FIXTURES / "tiny.png").read_bytes()
    with pytest.raises(InvalidInputError, match="too small"):
        validate_input(data, "tiny.png")


def test_rejects_empty_file():
    with pytest.raises(InvalidInputError, match="Empty"):
        validate_input(b"", "empty.png")


def test_scale_factor_maps_back_to_original():
    result = load_and_run(FIXTURES / "simple_layout.png")
    x_scale, y_scale = result.scale_factor
    # original (1200, 800) -> 1024x683 aspect-preserving canvas
    assert x_scale == pytest.approx(1024 / 1200)
    assert y_scale == pytest.approx(683 / 800)


def test_aspect_ratio_is_preserved_for_wide_image():
    result = load_and_run(FIXTURES / "simple_layout.png")
    assert result.resized_shape == (683, 1024)
    assert result.warnings == []


def test_grayscale_output_is_single_channel():
    result = run_pipeline((FIXTURES / "simple_layout.png").read_bytes(), "simple_layout.png")
    assert result.pixel_matrix.ndim == 2
