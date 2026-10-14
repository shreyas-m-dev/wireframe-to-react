import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from gemini_schema_adapter import adapt_gemini_response, normalize_page_type
from validation import validate_vision_schema

valid = {"page_type":"landing","sections":[{"id":"hero","kind":"hero","bounds":[0,0,.9,.4],"layout":"column","columns":1,"items":[{"id":"title","kind":"heading","label":"Welcome","bounds":[.1,.1,.5,.1],"confidence":.9}],"confidence":.8}]}
schema, report = adapt_gemini_response(valid); validate_vision_schema(schema)
assert report["adapterUsed"] and schema["nodes"][0]["children"][0]["role"] == "heading"
for value, expected in [("landing-page", "landing"), ("homepage", "landing"), ("e-commerce", "ecommerce"), ("product-page", "ecommerce"), ("admin-panel", "dashboard"), ("workspace", "dashboard"), ("login", "auth"), ("signup", "auth"), ("website", "generic"), ("nonsense", "generic"), ("", "generic")]:
    assert normalize_page_type(value)[0] == expected
for invalid in ({"page_type":"landing","sections":[]}, {"page_type":"bad","sections":[{}]}, {"page_type":"landing","sections":[{"kind":"unknown","bounds":[0,0,1,1],"items":[]}]}):
    try: adapt_gemini_response(invalid); raise AssertionError("invalid Gemini response accepted")
    except ValueError: pass
singular = {"page_type":"generic","section":{"id":"section-1","kind":"generic","bounds":[0,0,1,1],"items":[{"id":"item-1","kind":"text","bounds":[.1,.1,.2,.1],"confidence":.5}]}}
_, singular_report = adapt_gemini_response(singular); assert "singular-section-normalized" in singular_report["warnings"]
wrapped = {"page_type":"generic","items":[{"id":"item-1","kind":"text","bounds":[.1,.1,.2,.1],"confidence":.5}]}
_, wrapped_report = adapt_gemini_response(wrapped); assert "top-level-items-wrapped" in wrapped_report["warnings"]
print("PASS: Gemini shallow contract adapter and internal schema validation")
