"""Regression for Windows command length: fixture bridge takes paths, not JSON."""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_large_schema_is_read_from_file() -> None:
    if not shutil.which("node"):
        print("SKIP: node unavailable")
        return
    with tempfile.TemporaryDirectory() as temporary:
        folder = Path(temporary)
        # The JSON alone is > Windows' usual 32K command line boundary.
        elements = [{"type": "text", "confidence": .9, "x": index * 2, "y": 10, "width": 1, "height": 10, "label": "payload" * 100} for index in range(400)]
        elements_path = folder / "elements.json"
        schema_path = folder / "schema.json"
        tree_path = folder / "tree.txt"
        elements_path.write_text(json.dumps(elements), encoding="utf-8")
        assert elements_path.stat().st_size > 32_000
        result = subprocess.run([
            "node", str(ROOT / "scripts" / "run_validation_from_files.js"), "schema",
            "--elements", str(elements_path), "--output", str(schema_path), "--tree-output", str(tree_path),
        ], cwd=ROOT, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert schema_path.exists() and tree_path.exists()


if __name__ == "__main__":
    test_large_schema_is_read_from_file()
    print("PASS: long schema payload is read from a file, not node -e")
