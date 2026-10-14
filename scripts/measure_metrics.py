#!/usr/bin/env python3
"""
Generates the metrics the spec's "what to measure for the report" section
calls for. Uses hand-crafted schema+JSX test cases (some deliberately
flawed, simulating what an LLM in GEN_MODE=llm might produce) rather than
the real deterministic pipeline, specifically because the default compiler
never hallucinates — there'd be nothing interesting to measure. For proof
that the real pipeline works end-to-end on real images, see
scripts/test_e2e_integration.py. Swap TEST_CASES here for real LLM output
samples if you enable GEN_MODE=llm and want report numbers for that path.

Run: python3 scripts/measure_metrics.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Each case: a schema tree + a (possibly flawed) generated JSX string,
# simulating varied LLM output quality across a test set. Swap for real
# schema+codegen output once step 5 is wired to a live API key.
TEST_CASES = [
    {
        "name": "single_button_clean",
        "schema": {"type": "root", "children": [{"type": "button", "id": "b1", "children": []}]},
        "raw_jsx": "<div><button>Go</button></div>",
    },
    {
        "name": "header_with_hallucinated_canvas",
        "schema": {
            "type": "root",
            "children": [
                {"type": "text", "id": "t1", "children": []},
                {"type": "button", "id": "b1", "children": []},
            ],
        },
        "raw_jsx": '<div><p>Logo</p><button>Login</button><canvas></canvas></div>',
    },
    {
        "name": "form_missing_one_field",
        "schema": {
            "type": "root",
            "children": [
                {"type": "input", "id": "i1", "children": []},
                {"type": "input", "id": "i2", "children": []},
                {"type": "button", "id": "b1", "children": []},
            ],
        },
        "raw_jsx": '<div><input /><button>Submit</button></div>',  # missing one input
    },
    {
        "name": "card_grid_with_hallucinated_video",
        "schema": {
            "type": "root",
            "children": [
                {"type": "container", "id": "c1", "children": []},
                {"type": "container", "id": "c2", "children": []},
            ],
        },
        "raw_jsx": '<div><div></div><div></div><video></video></div>',
    },
    {
        "name": "clean_two_button_row",
        "schema": {
            "type": "root",
            "children": [
                {"type": "button", "id": "b1", "children": []},
                {"type": "button", "id": "b2", "children": []},
            ],
        },
        "raw_jsx": '<div><button>A</button><button>B</button></div>',
    },
]


def run_node(js_expr: str):
    script = f"""
const {{ runCgda, parseJsx }} = require('{ROOT}/services/cgda/cgda');
const {{ validateWithRetry, diffTrees }} = require('{ROOT}/services/validation/validate');
{js_expr}
"""
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True, cwd=str(ROOT))
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def main():
    rows = []
    for case in TEST_CASES:
        schema_json = json.dumps(case["schema"])
        raw_jsx_json = json.dumps(case["raw_jsx"])

        before = run_node(f"""
const schema = {schema_json};
const jsx = {raw_jsx_json};
const diff = diffTrees(schema, parseJsx(jsx));
console.log(JSON.stringify(diff));
""")

        cgda_result = run_node(f"""
const schema = {schema_json};
const jsx = {raw_jsx_json};
console.log(JSON.stringify(runCgda(jsx, schema)));
""")

        after = run_node(f"""
const schema = {schema_json};
const jsx = {json.dumps(cgda_result['cleanedJsx'])};
const diff = diffTrees(schema, parseJsx(jsx));
console.log(JSON.stringify(diff));
""")

        # simulate a bounded retry loop: since we don't have a live LLM to
        # regenerate against in this sandbox, "retry" here re-applies CGDA
        # to the same output (a no-op regenerate) — this measures
        # auto-correct convergence, not live-LLM convergence. Swap
        # regenerateFn for a real codegen call once GEMINI_API_KEY is available.
        retry_result = run_node(f"""
const schema = {schema_json};
const jsx = {json.dumps(cgda_result['cleanedJsx'])};
const result = validateWithRetry(schema, jsx, (prev) => prev, 2);
console.log(JSON.stringify({{valid: result.valid, attempts: result.attempts}}));
""")

        rows.append({
            "case": case["name"],
            "hallucinated_before": len(cgda_result["report"]["stripped"]),
            "hallucination_rate_before": round(cgda_result["hallucinationRate"], 3),
            "structural_accuracy_before": round(before["structuralAccuracy"], 3),
            "structural_accuracy_after_cgda": round(after["structuralAccuracy"], 3),
            "valid_after_validation": retry_result["valid"],
            "retry_attempts": retry_result["attempts"],
        })

    print(f"{'case':<32}{'halluc_before':<15}{'acc_before':<12}{'acc_after_cgda':<16}{'valid':<8}{'retries'}")
    for r in rows:
        print(
            f"{r['case']:<32}{r['hallucinated_before']:<15}"
            f"{r['structural_accuracy_before']:<12}{r['structural_accuracy_after_cgda']:<16}"
            f"{str(r['valid_after_validation']):<8}{r['retry_attempts']}"
        )

    n = len(rows)
    avg_halluc_rate_before = sum(r["hallucination_rate_before"] for r in rows) / n
    avg_acc_before = sum(r["structural_accuracy_before"] for r in rows) / n
    avg_acc_after = sum(r["structural_accuracy_after_cgda"] for r in rows) / n
    pct_valid = sum(1 for r in rows if r["valid_after_validation"]) / n

    print("\n--- Aggregate (report-ready numbers) ---")
    print(f"Mean hallucination rate before CGDA: {avg_halluc_rate_before:.1%}")
    print(f"Mean structural accuracy before any correction: {avg_acc_before:.1%}")
    print(f"Mean structural accuracy after CGDA: {avg_acc_after:.1%}")
    print(f"% of test cases valid after CGDA + validation: {pct_valid:.1%}")
    print(f"Retry count distribution: {[r['retry_attempts'] for r in rows]}")

    Path(ROOT / "metrics_output.json").write_text(json.dumps(rows, indent=2))
    print(f"\nRaw rows written to metrics_output.json")


if __name__ == "__main__":
    main()
