"""Bounds-normalized canonical reconciliation for CV/OCR and vision evidence."""
from __future__ import annotations
from typing import Any

STRUCTURAL_ROLES = {"page", "header", "main", "footer", "section", "hero-section", "services-section", "about-section", "contact-section", "split-content-section", "form", "nav-group", "gallery", "product-area", "product-detail", "related-products", "sidebar"}
ROLE_SYNONYMS = {"hero":"hero-section", "card-grid":"feature-card-grid", "repeated-card-grid":"feature-card-grid", "media":"media-region", "contact-action":"action", "nav-action":"nav-link", "primary-action":"action", "secondary-action":"action"}
LANDING_FORBIDDEN = {"thumbnail-gallery", "media-thumbnail-strip", "thumbnail-image", "product-gallery", "product-detail", "related-products", "product-area", "product-card-grid"}

def normalize_role(role: Any) -> str:
    return ROLE_SYNONYMS.get(str(role or ""), str(role or ""))

def normalize_bounds(node: dict, canvas: dict | None = None, source: str = "unknown") -> tuple[dict | None, dict | None]:
    """Return canonical pixel bounds or a safe diagnostic; never raise KeyError."""
    raw = node.get("bbox") or node.get("bounds") or node.get("bboxPx") or node.get("relativeBounds") or node
    try:
        if isinstance(raw, (list, tuple)) and len(raw) == 4: x, y, width, height = map(float, raw)
        elif isinstance(raw, dict) and all(key in raw for key in ("left", "top", "right", "bottom")):
            x, y = float(raw["left"]), float(raw["top"]); width, height = float(raw["right"]) - x, float(raw["bottom"]) - y
        elif isinstance(raw, dict) and all(key in raw for key in ("x", "y", "width", "height")):
            x, y, width, height = (float(raw[key]) for key in ("x", "y", "width", "height"))
        else: raise ValueError("missing x/y/width/height, left/top/right/bottom, or bbox array")
        if max(abs(x), abs(y), abs(width), abs(height)) <= 1.001 and canvas:
            x, y, width, height = x * canvas["width"], y * canvas["height"], width * canvas["width"], height * canvas["height"]
        elif max(abs(x), abs(y), abs(width), abs(height)) <= 1000.001 and canvas and (x + width > canvas["width"] or y + height > canvas["height"]):
            x, y, width, height = x / 1000 * canvas["width"], y / 1000 * canvas["height"], width / 1000 * canvas["width"], height / 1000 * canvas["height"]
        if width <= 0 or height <= 0: raise ValueError("width and height must be positive")
        return {"x": x, "y": y, "width": width, "height": height}, None
    except (TypeError, ValueError, KeyError) as exc:
        return None, {"source": source, "nodeId": node.get("id"), "role": node.get("role") or node.get("type"), "rawBounds": raw if isinstance(raw, (dict, list, tuple)) else None, "reason": str(exc)}

def iou(a: dict, b: dict) -> float:
    ix, iy = max(a["x"], b["x"]), max(a["y"], b["y"]); ex, ey = min(a["x"] + a["width"], b["x"] + b["width"]), min(a["y"] + a["height"], b["y"] + b["height"])
    inter = max(0, ex - ix) * max(0, ey - iy); union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return inter / union if union else 0.0

def compatible_roles(a: str, b: str) -> bool:
    if a == b or (a in STRUCTURAL_ROLES and b in STRUCTURAL_ROLES): return True
    return {a, b} <= {"action", "button", "nav-action", "primary-action", "submit-action"} or {a, b} <= {"copy", "text", "heading", "section-heading", "hero-heading"} or {a, b} <= {"media", "image", "map-region", "media-region"}

def _flatten(nodes):
    result = []
    for node in nodes or []: result.append(node); result.extend(_flatten(node.get("children", [])))
    return result

def _text(node): return str(node.get("text") or node.get("label") or "").strip().lower()

def canonical_reconciliation(cv_elements, vision_schema, canvas=None, category="generic"):
    canvas = canvas or {"width": 1, "height": 1}; diagnostics = {"sourceMajorRegions": [], "canonicalMajorRegions": [], "missingRoles": [], "droppedNodes": [], "reparentedNodes": [], "fallbackNodes": [], "boundsDiagnostics": [], "duplicateReconciliation": []}
    items = []
    for source, nodes in (("cv-ocr", cv_elements), ("vision", _flatten((vision_schema or {}).get("nodes", [])))):
        for raw in nodes:
            bounds, error = normalize_bounds(raw, canvas, source)
            if error: diagnostics["boundsDiagnostics"].append(error); diagnostics["droppedNodes"].append({"source":source,"id":raw.get("id"),"reason":"invalid-bounds"}); continue
            item = dict(raw); item.update(bounds); item["bbox"] = bounds; item["role"] = normalize_role(item.get("role")); item["sources"] = list(set(item.get("sources", []) + ["vision" if source == "vision" else "cv"]))
            # `sources` is transport metadata. The schema builder needs an
            # explicit payload to preserve adapter provenance into canonical
            # nodes and prevent a later CV-only reconstruction from being
            # labelled vision-merged.
            if source == "vision":
                item["visionEvidence"] = {"adapterNodeId": raw.get("id"), "role": item["role"], "parentId": raw.get("parentId"), "confidence": raw.get("confidence"), "bounds": bounds}
            items.append(item)
    if category == "landing":
        kept = []
        for item in items:
            if item["role"] in LANDING_FORBIDDEN: diagnostics["droppedNodes"].append({"source":item["sources"],"id":item.get("id"),"reason":"landing-category-filter","role":item["role"]})
            else: kept.append(item)
        items = kept
    # Highest confidence retains geometry; merge semantic evidence only when
    # overlap AND compatible role/text support the same visual control.
    canonical = []
    for item in sorted(items, key=lambda value: value.get("confidence", .5), reverse=True):
        match = next((kept for kept in canonical if compatible_roles(item["role"], kept["role"]) and iou(item["bbox"], kept["bbox"]) >= .65 and (not _text(item) or not _text(kept) or _text(item) == _text(kept) or item["role"] in STRUCTURAL_ROLES)), None)
        if match:
            match["sources"] = sorted(set(match["sources"] + item["sources"])); match["visionEvidence"] = item.get("visionEvidence") or match.get("visionEvidence")
            if item["role"] in STRUCTURAL_ROLES and match["role"] not in STRUCTURAL_ROLES: match["role"] = item["role"]
            diagnostics["duplicateReconciliation"].append({"keptId":match.get("id"),"mergedId":item.get("id"),"iou":round(iou(item["bbox"],match["bbox"]),3),"decision":"merged-evidence"})
        else: canonical.append(item)
    diagnostics["sourceMajorRegions"] = [item["role"] for item in items if item["role"] in STRUCTURAL_ROLES]
    diagnostics["canonicalMajorRegions"] = [item["role"] for item in canonical if item["role"] in STRUCTURAL_ROLES]
    return {"elements": canonical, "report": {"category":category,"visionUsed":bool(vision_schema),"schemaSource":"vision-merged" if vision_schema else "local-cv-ocr-fallback","duplicateSuppression":{"before":len(items),"after":len(canonical),"decisions":diagnostics["duplicateReconciliation"]},"categoryFiltering":{"before":len(items),"after":len(canonical),"suppressedRoles":[item.get("role") for item in items if item.get("role") in LANDING_FORBIDDEN]},"validation":{"valid":not diagnostics["boundsDiagnostics"],"errors":[x["reason"] for x in diagnostics["boundsDiagnostics"]]},"diagnostics":diagnostics}}
