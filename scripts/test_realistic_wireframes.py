#!/usr/bin/env python3
"""
Stress-tests the full pipeline against harder, more realistic wireframe
styles than the original 3 clean synthetic fixtures — rounded corners
(anti-aliased), JPEG compression artifacts, and a hand-drawn/sketchy style
with jittery lines. This directly answers "can it detect real wireframes,
not just the ones drawn to work with this specific algorithm."

Run: python3 scripts/test_realistic_wireframes.py
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "scripts" / "cli_pipeline.py"
TMP = Path("/tmp/realistic_wireframe_tests")
TMP.mkdir(exist_ok=True)

passed, failed = 0, 0


def make_rounded_ui():
    img = np.full((600, 900, 3), 255, dtype=np.uint8)

    def rounded_rect(pt1, pt2, color, thickness, r=12):
        x1, y1 = pt1; x2, y2 = pt2
        cv2.ellipse(img, (x1 + r, y1 + r), (r, r), 180, 0, 90, color, thickness, cv2.LINE_AA)
        cv2.ellipse(img, (x2 - r, y1 + r), (r, r), 270, 0, 90, color, thickness, cv2.LINE_AA)
        cv2.ellipse(img, (x1 + r, y2 - r), (r, r), 90, 0, 90, color, thickness, cv2.LINE_AA)
        cv2.ellipse(img, (x2 - r, y2 - r), (r, r), 0, 0, 90, color, thickness, cv2.LINE_AA)
        cv2.line(img, (x1 + r, y1), (x2 - r, y1), color, thickness, cv2.LINE_AA)
        cv2.line(img, (x1 + r, y2), (x2 - r, y2), color, thickness, cv2.LINE_AA)
        cv2.line(img, (x1, y1 + r), (x1, y2 - r), color, thickness, cv2.LINE_AA)
        cv2.line(img, (x2, y1 + r), (x2, y2 - r), color, thickness, cv2.LINE_AA)

    rounded_rect((30, 30), (870, 90), (60, 60, 60), 2)
    rounded_rect((650, 40), (770, 80), (30, 30, 30), 2)
    rounded_rect((790, 40), (860, 80), (30, 30, 30), 2)
    rounded_rect((30, 130), (430, 400), (80, 80, 80), 2)
    rounded_rect((470, 130), (870, 400), (80, 80, 80), 2)
    rounded_rect((30, 440), (870, 560), (80, 80, 80), 2)
    path = TMP / "rounded_ui.png"
    cv2.imwrite(str(path), img)
    return path


def make_jpeg_compressed():
    img = cv2.imread(str(ROOT / "services/preprocessing/fixtures/simple_layout.png"))
    path = TMP / "jpeg_compressed.jpg"
    cv2.imwrite(str(path), img, [cv2.IMWRITE_JPEG_QUALITY, 60])
    return path


def make_handdrawn():
    img = np.full((700, 1000, 3), 255, dtype=np.uint8)
    rng = np.random.RandomState(42)

    def jittery_rect(pt1, pt2, color, thickness):
        x1, y1 = pt1; x2, y2 = pt2
        pts = [(x1, y1), (x2, y1), (x2, y2), (x1, y2), (x1, y1)]
        for i in range(len(pts) - 1):
            p1 = (pts[i][0] + rng.randint(-3, 3), pts[i][1] + rng.randint(-3, 3))
            p2 = (pts[i + 1][0] + rng.randint(-3, 3), pts[i + 1][1] + rng.randint(-3, 3))
            cv2.line(img, p1, p2, color, thickness, cv2.LINE_AA)

    jittery_rect((40, 40), (960, 120), (20, 20, 20), 3)
    jittery_rect((780, 55), (940, 105), (20, 20, 20), 3)
    jittery_rect((40, 160), (300, 600), (20, 20, 20), 3)
    jittery_rect((340, 160), (960, 380), (20, 20, 20), 3)
    jittery_rect((340, 420), (640, 600), (20, 20, 20), 3)
    jittery_rect((680, 420), (960, 600), (20, 20, 20), 3)
    path = TMP / "handdrawn.png"
    cv2.imwrite(str(path), img)
    return path


FIXTURES = [
    ("rounded-corner, anti-aliased UI mockup", make_rounded_ui),
    ("JPEG-compressed (quality=60, real compression artifacts)", make_jpeg_compressed),
    ("hand-drawn/sketchy style (jittery irregular lines)", make_handdrawn),
]


def call_python_cli(args):
    result = subprocess.run(["python3", str(CLI), *args], capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        try:
            raise RuntimeError(json.loads(result.stderr)["error"])
        except (json.JSONDecodeError, KeyError):
            raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def run_node(js_expr: str):
    result = subprocess.run(["node", "-e", js_expr], capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def run_pipeline(image_path: Path) -> dict:
    detect_result = call_python_cli(["detect", str(image_path)])
    elements = detect_result["elements"]

    schema = run_node(f"""
const {{ buildSchema }} = require('{ROOT}/services/schema/schema');
console.log(JSON.stringify(buildSchema({json.dumps(elements)})));
""")

    gen_result = call_python_cli(["generate", json.dumps(schema)])
    raw_jsx = gen_result["rawJsx"]

    cgda_result = run_node(f"""
const {{ runCgda }} = require('{ROOT}/services/cgda/cgda');
console.log(JSON.stringify(runCgda({json.dumps(raw_jsx)}, {json.dumps(schema)})));
""")
    cleaned_jsx = cgda_result["cleanedJsx"]

    validation = run_node(f"""
const {{ validateWithRetry }} = require('{ROOT}/services/validation/validate');
const result = validateWithRetry({json.dumps(schema)}, {json.dumps(cleaned_jsx)}, (prev) => prev, 2);
console.log(JSON.stringify({{
  valid: result.valid,
  attempts: result.attempts,
  structuralAccuracy: result.diff.structuralAccuracy,
}}));
""")

    return {
        "elementsDetected": len(elements),
        "strippedByCgda": len(cgda_result["report"]["stripped"]),
        "code": cleaned_jsx,
        **validation,
    }


def check(name, make_fixture_fn):
    global passed, failed
    try:
        image_path = make_fixture_fn()
        result = run_pipeline(image_path)
        assert result["elementsDetected"] > 0, "detector found nothing at all"
        assert result["valid"] is True, f"validation invalid, accuracy={result['structuralAccuracy']}"
        assert result["structuralAccuracy"] == 1.0
        print(f"PASS  {name}")
        print(f"      -> {result['elementsDetected']} elements detected, accuracy {result['structuralAccuracy']*100:.0f}%, {result['attempts']} retries")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


if __name__ == "__main__":
    for label, fn in FIXTURES:
        check(label, fn)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
