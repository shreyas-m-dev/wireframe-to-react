"""
Regression test for two real bugs found via user report, both in the
pipeline-status animation (frontend/src/App.jsx):

1. The animation interval had no upper bound — on any backend request
   slower than STEPS.length * 380ms (~2.7s, easily exceeded once
   OCR/detection does real work on an actual image), it read past the end
   of the STEPS array and crashed with "Cannot read properties of
   undefined (reading 'id')", taking the whole page down to blank with no
   on-screen error.
2. Even after adding a self-clearing guard, React 18 StrictMode's
   dev-mode double-invocation runs the click handler's setup code twice,
   creating two intervals that shared one ref — the first interval's
   self-clear ended up clearing the SECOND interval instead of itself,
   so it kept running unbounded anyway.

Fixed by having each interval capture and clear its own id (never relying
on a shared, mutable ref), adding defensive bounds checks as a last line
of defense, and adding a top-level error boundary (AppErrorBoundary.jsx)
so any future unexpected error shows a recovery UI instead of a blank page.

This test bundles the REAL frontend with esbuild and drives it in a real
headless Chromium browser — it's the actual bug reproduced and disproven
end-to-end, not a unit test of the logic in isolation.

Run: python3 scripts/test_frontend_slow_response.py
(needs an esbuild binary findable on disk, plus `pip install playwright
&& playwright install chromium` — skips cleanly if either is missing)
"""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

MOCK_RESPONSE = {
    "code": (
        'import React from "react";\n\n'
        "export default function GeneratedComponent() {\n"
        "  return (\n"
        '    <div className="border rounded p-3">\n'
        '      <button className="px-4 py-2 border rounded">{"Button 1"}</button>\n'
        "    </div>\n"
        "  );\n"
        "}\n"
    ),
    "valid": True,
    "attempts": 0,
    "structuralAccuracy": 1.0,
    "elementsDetected": 1,
    "genMode": "template",
    "schema": {"type": "root", "id": "root-0", "children": []},
    "retryLog": [],
    "recognizedInstructions": [],
    "addedElement": None,
}
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de"
    "0000000c4944415478da6360000002000155a4b0790000000049454e44ae426082"
)

# The old bug's crash threshold was STEPS.length (7) * 380ms ≈ 2.7s.
# Delay well past that to prove the fix, not just get lucky on timing.
SLOW_RESPONSE_DELAY_S = 4


def find_esbuild():
    result = shutil.which("esbuild")
    if result:
        return result
    # search common locations: inside the project, and typical global npm
    # install prefixes (an esbuild binary often ships as a transitive
    # dependency of another global package, e.g. tsx) — checks broadly
    # rather than assuming one fixed path, since this varies by machine/OS
    search_roots = [
        ROOT,
        Path.home() / ".npm-global",
        Path("/usr/local/lib/node_modules"),
        Path("/usr/lib/node_modules"),
        Path("/home"),  # covers non-root home dirs like /home/<user>/.npm-global too
    ]
    for root in search_roots:
        if not root.exists():
            continue
        try:
            for candidate in root.rglob("@esbuild/*/bin/esbuild"):
                return str(candidate)
        except PermissionError:
            continue
    return None


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("SKIP  playwright not installed — this test needs `pip install playwright && playwright install chromium`")
        sys.exit(0)

    esbuild = find_esbuild()
    if not esbuild:
        print("SKIP  no esbuild binary found on disk")
        sys.exit(0)

    build_dir = Path("/tmp/frontend_slow_response_test")
    build_dir.mkdir(exist_ok=True)
    bundle_path = build_dir / "bundle.js"

    subprocess.run(
        [
            esbuild, "src/main.jsx", "--bundle", f"--outfile={bundle_path}",
            "--loader:.jsx=jsx", "--jsx=automatic",
            '--define:import.meta.env.VITE_API_BASE="http://localhost:9999"',
            "--format=iife",
        ],
        cwd=str(FRONTEND), check=True, capture_output=True,
    )
    (build_dir / "index.html").write_text(
        '<!doctype html><html><head><meta charset="utf-8"></head>'
        '<body><div id="root"></div><script src="bundle.js"></script></body></html>'
    )

    server = subprocess.Popen(
        ["python3", "-m", "http.server", "8899"], cwd=str(build_dir),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1)

    passed, failed = 0, 0

    def check(name, cond, detail=""):
        nonlocal passed, failed
        if cond:
            print(f"PASS  {name}")
            passed += 1
        else:
            print(f"FAIL  {name} {detail}")
            failed += 1

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page_errors = []
            page.on("pageerror", lambda e: page_errors.append(str(e)))

            def handle_route(route):
                time.sleep(SLOW_RESPONSE_DELAY_S)
                route.fulfill(status=200, content_type="application/json", body=json.dumps(MOCK_RESPONSE))

            page.route("**/api/generate", handle_route)
            page.goto("http://localhost:8899/index.html", timeout=10000)
            page.set_input_files("input[type=file]", {"name": "t.png", "mimeType": "image/png", "buffer": PNG_BYTES})
            page.click("button:has-text('Generate code')")
            page.wait_for_timeout(int((SLOW_RESPONSE_DELAY_S + 1.5) * 1000))

            body_text = page.locator("body").inner_text()

            check("no uncaught JS errors during a slow (4s) response", len(page_errors) == 0, str(page_errors))
            check("error boundary was NOT triggered (no crash happened)", "Something went wrong" not in body_text)
            check("page is not blank", len(body_text.strip()) > 100)
            check("result rendered after the delayed response", "Valid" in body_text)
            check("generated code visible", "Button 1" in body_text)

            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
