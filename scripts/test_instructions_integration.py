#!/usr/bin/env python3
"""
Integration test for the user-instructions feature (styling + safe
element addition) and OCR label extraction, combined — proxies
backend/server.js's exact updated request flow. Complements
test_e2e_integration.py (which covers the no-instructions case).

Run: python scripts/test_instructions_integration.py
"""
import json
import re
import subprocess
import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "scripts" / "cli_pipeline.py"
ROOT_JS = ROOT.as_posix()
FIXTURES_DIR = ROOT / "services" / "preprocessing" / "fixtures"

passed, failed = 0, 0


def call_python_cli(args):
    result = subprocess.run([sys.executable, str(CLI), *args], capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        raise RuntimeError(json.loads(result.stderr)["error"])
    return json.loads(result.stdout)


def run_node(js_expr: str):
    result = subprocess.run(["node", "-e", js_expr], capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def splice_addition(final_jsx: str, addition):
    """Python port of server.js's addition-splicing logic, for testing
    the same behavior without needing Express installed."""
    if not addition:
        return final_jsx
    addition_block = "\n".join("      " + l for l in addition["code"].split("\n"))
    pattern = re.compile(r"(\n(\s*)\);(\s*\n\}\s*\n?))$")
    m = pattern.search(final_jsx)
    if not m:
        return final_jsx
    indent = m.group(2)
    return (
        final_jsx[: m.start()]
        + f"\n{indent}  {{/* added per instruction: {addition['id']} */}}\n{addition_block}\n{indent});{m.group(3)}"
    )


def handle_generate_request(image_path: Path, instructions: str) -> dict:
    """Mirrors backend/server.js's POST /api/generate handler with instructions."""
    detect_result = call_python_cli(["detect", str(image_path)])
    elements = detect_result["elements"]

    schema = run_node(f"""
const {{ buildSchema }} = require('{ROOT_JS}/services/schema/schema');
console.log(JSON.stringify(buildSchema({json.dumps(elements)})));
""")

    gen_result = call_python_cli(["generate", json.dumps(schema), "null", instructions])
    raw_jsx = gen_result["rawJsx"]
    addition = gen_result.get("addition")

    cgda_result = run_node(f"""
const {{ runCgda }} = require('{ROOT_JS}/services/cgda/cgda');
console.log(JSON.stringify(runCgda({json.dumps(raw_jsx)}, {json.dumps(schema)})));
""")
    cleaned_jsx = cgda_result["cleanedJsx"]

    validation = run_node(f"""
const {{ validateWithRetry }} = require('{ROOT_JS}/services/validation/validate');
const result = validateWithRetry({json.dumps(schema)}, {json.dumps(cleaned_jsx)}, (prev) => prev, 2);
console.log(JSON.stringify({{
  valid: result.valid,
  attempts: result.attempts,
  structuralAccuracy: result.diff.structuralAccuracy,
  finalJsx: result.finalJsx,
}}));
""")

    final_code = splice_addition(validation["finalJsx"], addition)

    return {
        "elementsDetected": len(elements),
        "strippedByCgda": len(cgda_result["report"]["stripped"]),
        "recognizedInstructions": gen_result["recognizedInstructions"],
        "addition": addition,
        "finalCode": final_code,
        "valid": validation["valid"],
        "attempts": validation["attempts"],
        "structuralAccuracy": validation["structuralAccuracy"],
    }


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


def test_dark_theme_instruction_is_recognized_and_applied():
    result = handle_generate_request(FIXTURES_DIR / "simple_layout.png", "use a dark theme")
    assert "dark" in result["recognizedInstructions"]
    # Dark palette is slate (the compiler's own test_template_compiler.py asserts
    # the same root class); the earlier gray palette was replaced.
    assert "bg-slate-950" in result["finalCode"]
    assert result["valid"] is True
    assert result["structuralAccuracy"] == 1.0


def test_color_instruction_is_recognized_and_applied():
    result = handle_generate_request(FIXTURES_DIR / "simple_layout.png", "make the buttons green")
    assert "green" in result["recognizedInstructions"]
    assert "bg-green-600" in result["finalCode"]
    assert result["valid"] is True


def test_instructions_never_break_structural_validity():
    """Kitchen sink: every style category at once must still validate."""
    instructions = "dark theme with rounded purple buttons, bold text, thick border, large, shadow, transparent"
    result = handle_generate_request(FIXTURES_DIR / "login_form.png", instructions)
    assert result["strippedByCgda"] == 0
    assert result["structuralAccuracy"] == 1.0
    assert result["valid"] is True
    assert result["attempts"] == 0


def test_ocr_labels_appear_in_final_code_for_labeled_fixture():
    result = handle_generate_request(FIXTURES_DIR / "labeled_form.png", "")
    assert "Submit" in result["finalCode"]


def test_add_footer_instruction_splices_in_pre_vetted_template():
    result = handle_generate_request(FIXTURES_DIR / "simple_layout.png", "add a footer")
    assert result["addition"] is not None
    assert result["addition"]["id"] == "footer-links-row"
    assert "<footer" in result["finalCode"]
    # the core wireframe-derived content must STILL be 100% valid —
    # the addition is not counted toward or against this
    assert result["structuralAccuracy"] == 1.0
    assert result["strippedByCgda"] == 0


def test_unrecognized_addition_request_adds_nothing():
    result = handle_generate_request(FIXTURES_DIR / "simple_layout.png", "add a spaceship")
    assert result["addition"] is None
    assert "spaceship" not in result["finalCode"]


def test_no_instructions_behaves_exactly_like_before():
    result = handle_generate_request(FIXTURES_DIR / "card_grid.png", "")
    assert result["recognizedInstructions"] == []
    assert result["addition"] is None
    assert result["valid"] is True
    assert result["structuralAccuracy"] == 1.0


if __name__ == "__main__":
    check("dark theme instruction recognized and applied", test_dark_theme_instruction_is_recognized_and_applied)
    check("color instruction recognized and applied", test_color_instruction_is_recognized_and_applied)
    check("all style instructions combined stay structurally valid", test_instructions_never_break_structural_validity)
    check("OCR labels appear in final delivered code", test_ocr_labels_appear_in_final_code_for_labeled_fixture)
    check("'add a footer' splices in a pre-vetted template", test_add_footer_instruction_splices_in_pre_vetted_template)
    check("unrecognized addition request adds nothing (no hallucination)", test_unrecognized_addition_request_adds_nothing)
    check("no instructions behaves exactly like the original default", test_no_instructions_behaves_exactly_like_before)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
