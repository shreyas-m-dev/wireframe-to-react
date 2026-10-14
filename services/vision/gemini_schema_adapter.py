"""Gemini shallow-response validation and conversion into internal vision nodes."""
from __future__ import annotations
from typing import Any

PAGE_TYPES = {"landing", "ecommerce", "dashboard", "auth", "generic"}
_SYNONYMS = {
    **{v: "landing" for v in ("landing", "landing-page", "landing_page", "landing page", "homepage", "home-page", "home page", "marketing", "marketing-page", "business-site", "business website", "portfolio", "promotional")},
    **{v: "ecommerce" for v in ("ecommerce", "e-commerce", "e_commerce", "shop", "store", "storefront", "product", "product-page", "product detail", "product-detail", "shopping", "catalog")},
    **{v: "dashboard" for v in ("dashboard", "admin", "admin-panel", "admin panel", "analytics", "analytics-dashboard", "reporting", "portal", "workspace")},
    **{v: "auth" for v in ("auth", "authentication", "login", "log-in", "sign-in", "signin", "signup", "sign-up", "register", "registration")},
    **{v: "generic" for v in ("generic", "website", "webpage", "web-page", "page", "unknown", "other", "ui", "interface", "null", "empty")},
}
_SYNONYMS = {" ".join(k.replace("_", " ").replace("-", " ").split()): v for k, v in _SYNONYMS.items()}
SECTION_KINDS = {"header", "hero", "content", "cards", "split", "about", "contact", "footer", "product", "related", "form", "generic"}
ITEM_KINDS = {"logo", "nav", "heading", "text", "button", "input", "select", "media", "map", "card", "divider", "icon", "generic"}
ROLE_MAP = {"logo":"logo", "nav":"nav-group", "heading":"heading", "text":"copy", "button":"action", "input":"field", "select":"select", "media":"media", "map":"map-region", "card":"card", "divider":"divider", "icon":"icon", "generic":"region"}
SECTION_ROLE_MAP = {"header":"header", "hero":"hero-section", "content":"section", "cards":"services-section", "split":"split-content-section", "about":"about-section", "contact":"contact-section", "footer":"footer", "product":"product-area", "related":"related-products", "form":"form", "generic":"section"}

def normalize_page_type(value: Any) -> tuple[str, dict]:
    original = _string(value, 64) if value is not None else "null"
    key = " ".join(str(value or "").strip().lower().replace("_", " ").replace("-", " ").split())
    canonical = _SYNONYMS.get(key, "generic")
    return canonical, {"originalPageType": original, "normalizedPageType": canonical, "mappingReason": "known-synonym" if key in _SYNONYMS and key != canonical else "canonical" if key in _SYNONYMS else "unrecognized-page-type", "confidencePenalty": 0 if key in _SYNONYMS else .2}

def _string(value: Any, max_length: int = 160) -> str | None:
    if not isinstance(value, str): return None
    cleaned = " ".join(value.replace("<", "").replace(">", "").split())[:max_length]
    return cleaned or None

def _bounds(value: Any, path: str, warnings: list[str]) -> dict:
    if not isinstance(value, list) or len(value) != 4 or any(not isinstance(v, (int, float)) for v in value):
        raise ValueError(f"{path}.bounds expected [x,y,width,height] numbers")
    x, y, width, height = map(float, value)
    if width <= 0 or height <= 0: raise ValueError(f"{path}.bounds width and height must be positive")
    original = (x, y, width, height); x, y = max(0, x), max(0, y); width, height = min(width, 1 - x), min(height, 1 - y)
    if width <= 0 or height <= 0: raise ValueError(f"{path}.bounds lies outside normalized frame")
    if original != (x, y, width, height): warnings.append(f"{path}.bounds clamped to normalized frame")
    return {"x": round(x, 4), "y": round(y, 4), "width": round(width, 4), "height": round(height, 4)}

def adapt_gemini_response(value: dict) -> tuple[dict, dict]:
    """Validate shallow Gemini JSON, then produce the existing internal contract."""
    if not isinstance(value, dict): raise ValueError("$ expected JSON object")
    page_type, page_type_info = normalize_page_type(value.get("page_type"))
    warnings: list[str] = []
    sections = value.get("sections")
    if sections is None and isinstance(value.get("section"), dict):
        sections = [value["section"]]; warnings.append("singular-section-normalized")
    elif sections is None and isinstance(value.get("items"), list) and value["items"]:
        sections = [{"id": "generated-section-1", "kind": "generic", "bounds": [0, 0, 1, 1], "layout": "column", "columns": 1, "items": value["items"], "confidence": .5}]; warnings.append("top-level-items-wrapped")
    if not isinstance(sections, list) or not sections: raise ValueError("$.sections expected non-empty array")
    if len(sections) > 24: raise ValueError("$.sections exceeds 24")
    nodes: list[dict] = []
    for index, section in enumerate(sections):
        path = f"$.sections[{index}]"
        if not isinstance(section, dict): raise ValueError(f"{path} expected object")
        if not _string(section.get("id"), 64): raise ValueError(f"{path}.id expected non-empty string")
        kind = section.get("kind")
        if kind not in SECTION_KINDS: raise ValueError(f"{path}.kind invalid enum")
        bounds = _bounds(section.get("bounds"), path, warnings)
        identifier = _string(section.get("id"), 64)
        items = section.get("items")
        if not isinstance(items, list) or not items or len(items) > 40: raise ValueError(f"{path}.items expected non-empty array up to 40")
        children = []
        for item_index, item in enumerate(items):
            item_path = f"{path}.items[{item_index}]"
            if not isinstance(item, dict) or item.get("kind") not in ITEM_KINDS: raise ValueError(f"{item_path}.kind invalid enum")
            if not _string(item.get("id"), 64): raise ValueError(f"{item_path}.id expected non-empty string")
            confidence = item.get("confidence", .5)
            if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1: raise ValueError(f"{item_path}.confidence expected 0..1")
            item_kind = item["kind"]
            children.append({"id": _string(item.get("id"), 64), "type": item_kind if item_kind not in {"nav", "logo", "generic"} else "region", "role": ROLE_MAP[item_kind], "text": _string(item.get("label")), "bounds": _bounds(item.get("bounds"), item_path, warnings), "confidence": float(confidence), "layout": {"direction": "auto", "columns": 1, "gap": 0}, "styleHints": {}, "uncertainty": 1 - float(confidence), "evidence": "gemini-shallow-response", "children": []})
        confidence = section.get("confidence", .6)
        if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1: raise ValueError(f"{path}.confidence expected 0..1")
        nodes.append({"id": identifier, "type": "region", "role": SECTION_ROLE_MAP[kind], "text": _string(section.get("label")), "bounds": bounds, "confidence": float(confidence), "layout": {"direction": section.get("layout") if section.get("layout") in {"row", "column", "grid", "mixed"} else "column", "columns": int(section.get("columns", 1)) if isinstance(section.get("columns", 1), int) and 1 <= section.get("columns", 1) <= 8 else 1, "gap": 0}, "styleHints": value.get("style") if isinstance(value.get("style"), dict) else {}, "uncertainty": 1 - float(confidence), "evidence": "gemini-shallow-response", "children": children})
    if page_type_info["mappingReason"] == "unrecognized-page-type": warnings.append("page_type normalized to generic from unrecognized value")
    return {"pageCategory": page_type, "nodes": nodes}, {"adapterUsed": True, "warnings": warnings, "sectionCount": len(nodes), "itemCount": sum(len(n["children"]) for n in nodes), "pageType": page_type_info}
