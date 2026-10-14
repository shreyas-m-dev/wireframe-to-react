# Preprocessing module (Pipeline Step 1)

Pure Python, OpenCV-based. No web framework dependency yet — this is
intentional so it's testable in isolation before wiring it into the
FastAPI/Flask sidecar mentioned in the stack notes.

## Files

- `preprocess.py` — the module. Key entry points:
  - `validate_input(data, filename)` — raises `InvalidInputError` on bad input
  - `run_pipeline(data, filename)` — full validate → resize → grayscale → blur
    → normalize → pixel matrix pipeline, returns a `PreprocessResult`
  - `load_and_run(path)` — convenience wrapper for CLI/notebook use
- `fixtures/make_fixtures.py` — generates synthetic wireframe-style test
  images (a real dataset wasn't available in this environment). Replace
  `fixtures/simple_layout.png` with real wireframe exports as soon as you
  have some — everything downstream (YOLO training, schema tests) should
  eventually run against real samples, not synthetic ones.
- `tests/test_preprocess.py` — pytest version (use this once pytest is
  installed in your dev environment: `pip install pytest && pytest tests/`)
- `tests/run_tests_standalone.py` — dependency-free runner, same assertions,
  for environments without pytest. Delete once you're on pytest.

## Run it

```bash
pip install opencv-python numpy   # if not already present
python3 fixtures/make_fixtures.py
python3 tests/run_tests_standalone.py     # or: pytest tests/
```

## Design notes / decisions made

- **Target size 1024x1024**: arbitrary square default sized for YOLOv8's
  usual input; change `TARGET_SIZE` in `preprocess.py` if your fine-tuned
  model expects something else (e.g. 640x640 is more standard for YOLOv8
  and will train/infer faster — consider switching before step 2).
- **Scale factor is returned, not discarded**: step 2 (YOLO) will produce
  bounding boxes in resized-image coordinates. `PreprocessResult.scale_factor`
  lets you map those back to original-image coordinates if you ever need to
  overlay results on the original upload in the frontend.
- **Grayscale before blur**: order matches the spec's
  `resize → grayscale → blur → normalize`. If you find YOLO accuracy drops
  on grayscale wireframes (color sometimes helps distinguish filled buttons
  from outlined ones), it's easy to feed the resized *color* image to YOLO
  separately while keeping grayscale for other uses — flag this if hallucination
  numbers look off in step 6/7 measurement.
- **Validation is strict on purpose**: extension allowlist + decode check +
  min/max dimension bounds. The pipeline spec says "reject if invalid" as an
  explicit step, so this raises a typed exception (`InvalidInputError`)
  rather than silently coercing bad input — wire it to a 4xx at the API layer.

## Next step

Step 2 (YOLOv8 detection) should live in `services/detection/` as its own
Python module/sidecar, consuming `PreprocessResult.pixel_matrix` or the
resized color image. Per the build order: get a pretrained YOLOv8 running
end-to-end on a dummy class set first, before fine-tuning on real UI
classes.
