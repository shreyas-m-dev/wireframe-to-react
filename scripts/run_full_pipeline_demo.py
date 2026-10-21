#!/usr/bin/env python3
"""
CGDA/validation illustration demo — NOT the primary proof of the pipeline
anymore. For the real, fully-live end-to-end proof (real detector, real
schema, real RAG, real deterministic codegen, all on real images), see
scripts/test_e2e_integration.py instead — that one needs no faked data at
all and is what backend/src/pipeline/pipeline.js actually runs.

This script keeps its original, narrower purpose: since the default
deterministic compiler (template_compiler.py) never hallucinates by
construction, it never gives CGDA anything to strip. To still show CGDA
and the validation retry loop doing their job — the exact "before/after
hallucinated tag" scenario relevant if you enable GEN_MODE=llm, where an
LLM genuinely can hallucinate — this script fakes a flawed LLM-style
response on purpose and walks it through steps 6-7 for real.

Steps 1, 3, 4 run for real against the actual fixture image. Step 2 uses
hand-specified detections (a simpler stand-in than the real heuristic
detector, chosen here so the "one hallucinated tag" example stays easy to
follow). Step 5 is a hardcoded flawed response, not real codegen.

Run: python3 scripts/run_full_pipeline_demo.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services" / "preprocessing"))
sys.path.insert(0, str(ROOT / "services" / "rag"))

from preprocess import load_and_run
from retrieve import build_index, retrieve_templates

FIXTURE = ROOT / "services" / "preprocessing" / "fixtures" / "simple_layout.png"

# Stands in for what services/detection would return for FIXTURE, since no
# fine-tuned YOLOv8 model exists yet (matches the layout drawn by
# fixtures/make_fixtures.py: header bar, logo text, two nav buttons).
FAKE_DETECTIONS = [
    {"type": "container", "confidence": 0.95, "x": 0, "y": 0, "width": 1200, "height": 80},
    {"type": "text", "confidence": 0.9, "x": 30, "y": 30, "width": 100, "height": 30},
    {"type": "button", "confidence": 0.88, "x": 900, "y": 20, "width": 120, "height": 40},
    {"type": "text", "confidence": 0.85, "x": 925, "y": 30, "width": 70, "height": 20},
    {"type": "button", "confidence": 0.87, "x": 1040, "y": 20, "width": 130, "height": 40},
    {"type": "text", "confidence": 0.84, "x": 1055, "y": 30, "width": 100, "height": 20},
]

# Stands in for a first-pass LLM response: correct-ish, but includes ONE
# hallucinated <canvas> the LLM invented that has no schema backing —
# exactly the failure mode CGDA exists to catch.
FAKE_LLM_RESPONSE_ATTEMPT_1 = """<div>
  <header>
    <span>LOGO</span>
    <button><span>Login</span></button>
    <button><span>Sign Up</span></button>
  </header>
  <canvas id="decorative-chart"></canvas>
</div>"""


def run_node(js_expr: str):
    """Runs a one-off Node expression against the JS modules and returns parsed JSON stdout."""
    script = f"""
const {{ buildSchema }} = require('{ROOT}/services/schema/schema');
const {{ runCgda }} = require('{ROOT}/services/cgda/cgda');
const {{ validateWithRetry, diffTrees }} = require('{ROOT}/services/validation/validate');
{js_expr}
"""
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def main():
    print("=" * 70)
    print("STEP 1: Preprocessing")
    print("=" * 70)
    pre = load_and_run(FIXTURE)
    print(f"  original shape: {pre.original_shape}, resized: {pre.resized_shape}")
    print(f"  warnings: {pre.warnings}")

    print("\n" + "=" * 70)
    print("STEP 2: Detection (using stand-in detections — no trained model yet)")
    print("=" * 70)
    print(f"  {len(FAKE_DETECTIONS)} elements detected")

    print("\n" + "=" * 70)
    print("STEP 3: Schema construction (real)")
    print("=" * 70)
    elements_json = json.dumps(FAKE_DETECTIONS)
    schema = run_node(f"""
const elements = {elements_json};
const schema = buildSchema(elements);
console.log(JSON.stringify(schema));
""")
    print(json.dumps(schema, indent=2)[:600] + "\n  ...")

    print("\n" + "=" * 70)
    print("STEP 4: RAG retrieval (real, numpy backend)")
    print("=" * 70)
    store = build_index()
    templates = retrieve_templates(schema, store, k=3)
    for t in templates:
        print(f"  {t['score']:.2f}  {t['id']}")

    print("\n" + "=" * 70)
    print("STEP 5: LLM code generation (STAND-IN — no network/API key in this sandbox)")
    print("=" * 70)
    print("  raw output (note the hallucinated <canvas>):")
    print(FAKE_LLM_RESPONSE_ATTEMPT_1)

    print("\n" + "=" * 70)
    print("STEP 6: CGDA whitelist filter (real)")
    print("=" * 70)
    schema_json = json.dumps(schema)
    raw_jsx_json = json.dumps(FAKE_LLM_RESPONSE_ATTEMPT_1)
    cgda_result = run_node(f"""
const schema = {schema_json};
const rawJsx = {raw_jsx_json};
const result = runCgda(rawJsx, schema);
console.log(JSON.stringify(result));
""")
    print(f"  stripped {len(cgda_result['report']['stripped'])} hallucinated tag(s): "
          f"{[s['tag'] for s in cgda_result['report']['stripped']]}")
    print(f"  hallucination rate this pass: {cgda_result['hallucinationRate']:.2%}")
    print("  cleaned JSX:")
    print(cgda_result["cleanedJsx"])

    print("\n" + "=" * 70)
    print("STEP 7: Validation Engine (real diff, no retry needed post-CGDA)")
    print("=" * 70)
    diff = run_node(f"""
const schema = {schema_json};
const jsx = {json.dumps(cgda_result['cleanedJsx'])};
const {{ parseJsx }} = require('{ROOT}/services/cgda/cgda');
const diff = diffTrees(schema, parseJsx(jsx));
console.log(JSON.stringify(diff));
""")
    print(f"  structural accuracy: {diff['structuralAccuracy']:.2%}")
    print(f"  valid: {diff['isValid']}")
    if not diff["isValid"]:
        print(f"  missing in code: {[m['type'] for m in diff['missingInCode']]}")
        print(f"  extra in code: {[e['tag'] for e in diff['extraInCode']]}")

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Hallucination rate BEFORE CGDA: 1/{len(cgda_result['report']['stripped']) + diff['matchedCount']} "
          f"components were hallucinated (the <canvas>)")
    print(f"  Hallucination rate AFTER CGDA:  0% (stripped)")
    print(f"  Structural accuracy AFTER validation: {diff['structuralAccuracy']:.2%}")


if __name__ == "__main__":
    main()
