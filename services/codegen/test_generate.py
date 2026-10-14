import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate import build_prompt, _strip_markdown_fences

passed, failed = 0, 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


def test_prompt_includes_schema_json():
    schema = {"type": "root", "children": [{"type": "button", "children": []}]}
    prompt = build_prompt(schema, [])
    assert '"type": "button"' in prompt


def test_prompt_includes_template_code_and_score():
    schema = {"type": "root", "children": []}
    templates = [{"id": "single-button", "score": 0.87, "code": "<button>{label}</button>"}]
    prompt = build_prompt(schema, templates)
    assert "single-button" in prompt
    assert "0.87" in prompt
    assert "<button>{label}</button>" in prompt


def test_prompt_handles_no_templates():
    schema = {"type": "root", "children": []}
    prompt = build_prompt(schema, [])
    assert "no templates retrieved" in prompt


def test_prompt_includes_whitelist_rule():
    schema = {"type": "root", "children": []}
    prompt = build_prompt(schema, [])
    assert "Do not invent additional" in prompt


def test_strip_markdown_fences_removes_jsx_fence():
    raw = "```jsx\n<div><button>Go</button></div>\n```"
    assert _strip_markdown_fences(raw) == "<div><button>Go</button></div>"


def test_strip_markdown_fences_leaves_unfenced_text_alone():
    raw = "<div><button>Go</button></div>"
    assert _strip_markdown_fences(raw) == raw


if __name__ == "__main__":
    check("test_prompt_includes_schema_json", test_prompt_includes_schema_json)
    check("test_prompt_includes_template_code_and_score", test_prompt_includes_template_code_and_score)
    check("test_prompt_handles_no_templates", test_prompt_handles_no_templates)
    check("test_prompt_includes_whitelist_rule", test_prompt_includes_whitelist_rule)
    check("test_strip_markdown_fences_removes_jsx_fence", test_strip_markdown_fences_removes_jsx_fence)
    check("test_strip_markdown_fences_leaves_unfenced_text_alone", test_strip_markdown_fences_leaves_unfenced_text_alone)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
