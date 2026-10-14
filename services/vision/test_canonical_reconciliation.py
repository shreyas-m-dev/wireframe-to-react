import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from canonical_reconciliation import normalize_bounds, canonical_reconciliation

canvas = {"width": 1000, "height": 500}
assert normalize_bounds({"x": .1, "y": .2, "width": .3, "height": .4}, canvas)[0] == {"x":100.0,"y":100.0,"width":300.0,"height":200.0}
assert normalize_bounds({"left": 10, "top": 20, "right": 40, "bottom": 80}, canvas)[0] == {"x":10.0,"y":20.0,"width":30.0,"height":60.0}
assert normalize_bounds({"bbox": [1, 2, 3, 4]}, canvas)[0]["width"] == 3.0
bad, diagnostic = normalize_bounds({"role":"section"}, canvas); assert bad is None and diagnostic["reason"]
cv = [{"id":"cv-contact","x":10,"y":10,"width":100,"height":30,"role":"action","label":"CONTACT","confidence":.8}, {"id":"cv-nav","x":200,"y":10,"width":60,"height":20,"role":"nav-link","label":"CONTACT","confidence":.8}]
vision = {"nodes":[{"id":"v-contact","bounds":{"x":.01,"y":.02,"width":.1,"height":.06},"role":"action","type":"button","confidence":.9}, {"id":"v-product","bounds":{"x":.2,"y":.2,"width":.2,"height":.2},"role":"product-detail","type":"region","confidence":.9}]}
result = canonical_reconciliation(cv, vision, canvas, "landing")
assert len(result["elements"]) == 2 and result["report"]["diagnostics"]["duplicateReconciliation"]
assert any(x.get("reason") == "landing-category-filter" for x in result["report"]["diagnostics"]["droppedNodes"])
print("PASS: canonical bounds normalization, semantic duplicate matching, and category filtering")
