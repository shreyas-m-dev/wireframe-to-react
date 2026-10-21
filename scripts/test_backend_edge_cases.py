#!/usr/bin/env python3
"""
Backend robustness tests — exercises every failure mode
backend/server.js's /api/generate handler needs to survive without
crashing or returning a 500 with no useful message. Complements
test_e2e_integration.py (which proves the happy path across 3 real
wireframes); this proves the unhappy paths degrade cleanly.

Run: python scripts/test_backend_edge_cases.py
"""
import json
import os
import subprocess
import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "scripts" / "cli_pipeline.py"
FIXTURES_DIR = ROOT / "services" / "preprocessing" / "fixtures"

passed, failed = 0, 0


def run_cli(args, env=None):
    full_env = {**os.environ, **(env or {})}
    return subprocess.run(
        [sys.executable, str(CLI), *args], capture_output=True, text=True, cwd=str(ROOT), env=full_env
    )


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


def test_corrupt_upload_fails_cleanly_with_json_error():
    result = run_cli(["detect", str(FIXTURES_DIR / "corrupt.png")])
    assert result.returncode != 0
    err = json.loads(result.stderr)
    assert "error" in err and "decoded" in err["error"]


def test_missing_file_fails_cleanly():
    result = run_cli(["detect", str(Path(tempfile.gettempdir()) / "definitely_does_not_exist_xyz.png")])
    assert result.returncode != 0
    err = json.loads(result.stderr)
    assert "not found" in err["error"].lower()


def test_no_extension_temp_file_with_valid_image_bytes_still_works():
    """Regression test for a real bug found during review: multer's
    default disk storage (backend/server.js, before the fix) writes
    uploaded files to a temp path with NO extension — just a random
    32-char name. Every single upload through the actual web UI was
    silently rejected with "Unsupported file extension ''" before
    detection ever ran, even though the image itself was completely
    valid. Fixed on both ends: server.js now preserves the original
    extension via a custom multer filename function, AND this function
    was relaxed to not hard-require an extension when the file's actual
    decoded content is a valid image — defense in depth, so no future
    caller can reintroduce the same failure mode by mis-configuring how
    it writes temp files."""
    import shutil
    fixture = FIXTURES_DIR / "simple_layout.png"
    no_ext_path = str(Path(tempfile.gettempdir()) / "backend_test_no_extension_regression")
    shutil.copy(fixture, no_ext_path)
    result = run_cli(["detect", no_ext_path])
    assert result.returncode == 0, f"should succeed on a valid image with no extension, got: {result.stderr}"
    out = json.loads(result.stdout)
    assert len(out["elements"]) > 0


def test_wrong_but_present_extension_is_still_rejected():
    """The fix above must not become 'accept anything' — a file that
    genuinely claims to be a format we don't support should still be
    rejected, extension present or not."""
    import shutil
    fixture = FIXTURES_DIR / "simple_layout.png"
    fake_gif_path = str(Path(tempfile.gettempdir()) / "backend_test_fake_gif.gif")
    shutil.copy(fixture, fake_gif_path)
    result = run_cli(["detect", fake_gif_path])
    assert result.returncode != 0
    err = json.loads(result.stderr)
    assert "extension" in err["error"].lower()


def test_too_small_image_fails_cleanly():
    result = run_cli(["detect", str(FIXTURES_DIR / "tiny.png")])
    assert result.returncode != 0
    err = json.loads(result.stderr)
    assert "small" in err["error"].lower()


def test_blank_image_with_nothing_to_detect_fails_with_helpful_message():
    import cv2
    import numpy as np
    blank_path = str(Path(tempfile.gettempdir()) / "backend_test_blank.png")
    cv2.imwrite(blank_path, np.full((300, 300, 3), 255, dtype=np.uint8))
    result = run_cli(["detect", blank_path])
    assert result.returncode != 0
    err = json.loads(result.stderr)
    assert "no ui elements" in err["error"].lower()


def test_malformed_schema_json_fails_cleanly_not_a_stack_trace():
    result = run_cli(["generate", "{not valid json"])
    assert result.returncode != 0
    err = json.loads(result.stderr)  # must still be parseable JSON, not a raw traceback
    assert "error" in err


def test_llm_mode_without_api_key_falls_back_to_template_not_crash():
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    env = {"GEN_MODE": "llm"}
    env.pop("GEMINI_API_KEY", None)
    env.pop("OPENROUTER_API_KEY", None)
    result = run_cli(["generate", json.dumps(schema)], env=env)
    assert result.returncode == 0, f"should not crash, got: {result.stderr}"
    out = json.loads(result.stdout)
    assert out["genMode"] == "template-fallback"
    assert "<button" in out["rawJsx"]


def test_generate_with_error_report_arg_does_not_crash():
    """This is the exact call shape server.js's validateWithRetry
    regenerate callback makes on a retry."""
    schema = {"type": "root", "id": "root-0", "children": [{"type": "text", "id": "text-1", "children": []}]}
    error_report = {"missingInCode": ["text"], "extraInCode": ["canvas"]}
    result = run_cli(["generate", json.dumps(schema), json.dumps(error_report)])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert "rawJsx" in out


def test_unknown_subcommand_fails_cleanly():
    result = run_cli(["not-a-real-subcommand"])
    assert result.returncode != 0
    err = json.loads(result.stderr)
    assert "unknown subcommand" in err["error"].lower()


def test_default_gen_mode_is_template_without_env_var():
    env = dict(os.environ)
    env.pop("GEN_MODE", None)
    schema = {"type": "root", "id": "root-0", "children": [{"type": "button", "id": "button-1", "children": []}]}
    result = subprocess.run(
        [sys.executable, str(CLI), "generate", json.dumps(schema)],
        capture_output=True, text=True, cwd=str(ROOT), env=env,
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["genMode"] == "template", "default mode should be the network-free deterministic compiler"


if __name__ == "__main__":
    check("corrupt upload fails cleanly with JSON error", test_corrupt_upload_fails_cleanly_with_json_error)
    check("missing file fails cleanly", test_missing_file_fails_cleanly)
    check("no-extension temp file with valid image still works (multer bug regression)", test_no_extension_temp_file_with_valid_image_bytes_still_works)
    check("wrong-but-present extension is still rejected", test_wrong_but_present_extension_is_still_rejected)
    check("too-small image fails cleanly", test_too_small_image_fails_cleanly)
    check("blank image (nothing detected) fails with helpful message", test_blank_image_with_nothing_to_detect_fails_with_helpful_message)
    check("malformed schema JSON fails cleanly", test_malformed_schema_json_fails_cleanly_not_a_stack_trace)
    check("GEN_MODE=llm without API key falls back, doesn't crash", test_llm_mode_without_api_key_falls_back_to_template_not_crash)
    check("generate with error-report arg (retry-loop callback shape)", test_generate_with_error_report_arg_does_not_crash)
    check("unknown subcommand fails cleanly", test_unknown_subcommand_fails_cleanly)
    check("default GEN_MODE is template (network-free) without env var", test_default_gen_mode_is_template_without_env_var)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
