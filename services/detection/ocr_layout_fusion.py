"""Conservative OCR + geometry fusion used by the production CLI and fixtures."""
from __future__ import annotations
import re

STRUCTURAL = {"page", "header", "main", "product-area", "gallery", "product-detail", "related-products", "footer", "nav-group", "product-card-grid", "thumbnail-gallery", "hero-section", "services-section", "feature-card-grid", "feature-card", "split-content-section", "media-text-column", "text-media-column", "about-section", "contact-section", "form", "map-region"}


def _inside(item: dict, region: dict) -> bool:
    cx, cy = item["x"] + item["width"] / 2, item["y"] + item["height"] / 2
    return region["x"] <= cx <= region["x"] + region["width"] and region["y"] <= cy <= region["y"] + region["height"]


def _region(elements: list[dict], role: str) -> dict | None:
    return next((item for item in elements if item.get("role") == role), None)


def _struct(role: str, x: float, y: float, width: float, height: float, confidence: float, evidence: list[str], *, uncertainty: str | None = None) -> dict:
    return {"type": "region", "role": role, "confidence": confidence, "x": x, "y": y, "width": width, "height": height, "label": None, "evidence": evidence, "uncertainty": uncertainty}


def _union(items: list[dict]) -> tuple[float, float, float, float]:
    x1, y1 = min(item["x"] for item in items), min(item["y"] for item in items)
    x2, y2 = max(item["x"] + item["width"] for item in items), max(item["y"] + item["height"] for item in items)
    return x1, y1, x2 - x1, y2 - y1


def _append_region_if_supported(items: list[dict], role: str, support: list[dict], evidence: str) -> None:
    if _region(items, role) or not support:
        return
    x, y, width, height = _union(support)
    items.append(_struct(role, x, y, width, height, .66, [evidence]))


def _landing_regions(items: list[dict], lines: list[dict], canvas: dict) -> None:
    """Infer generic landing sections from OCR labels plus local geometry.

    Every region below needs a visible heading/CTA/form or repeated geometry;
    no filename, fixed coordinate, or ecommerce assumption is involved.
    """
    height = canvas["height"]
    meaningful = [line for line in lines if line.get("confidence", 0) >= 45 and re.search(r"[A-Za-z0-9]", line.get("text", "")) and line.get("text", "").strip() not in {"=", "|"}]
    def matches(pattern: str): return [line for line in meaningful if re.search(pattern, line["text"], re.I)]
    service_heads, about_heads, contact_heads = matches(r"^(?:our )?services?$"), matches(r"^about(?: us)?$"), matches(r"^contact(?: us)?$")
    cta_lines = [line for line in matches(r"^(?:get started|learn more|send)$") if line["y"] >= height * .13]
    if header := _region(items, "header"):
        header_bottom = header["y"] + header["height"]
    else:
        header_bottom = height * .12
    top_copy = [line for line in meaningful if header_bottom <= line["y"] < height * .42]
    prominent = [line for line in top_copy if line["height"] >= max(18, height * .018)]
    if prominent and cta_lines:
        hero_support = [min(prominent, key=lambda line: line["y"]), min(cta_lines, key=lambda line: abs(line["y"] - prominent[0]["y"]))]
        _append_region_if_supported(items, "hero-section", hero_support, "prominent top copy + local CTA OCR evidence")
    if service_heads:
        head = service_heads[0]
        local = [item for item in items if item.get("type") in {"image", "container", "region"} and item["y"] >= head["y"] and item["y"] < (about_heads[0]["y"] if about_heads else head["y"] + height * .34)]
        _append_region_if_supported(items, "services-section", [head] + local, "services heading + local visual regions")
        repeated = [item for item in local if item["width"] > canvas["width"] * .08 and item["height"] > canvas["height"] * .06]
        if len(repeated) >= 3:
            _append_region_if_supported(items, "feature-card-grid", repeated, "three-or-more similarly scoped service visual regions")
    if about_heads:
        head = about_heads[0]
        next_y = contact_heads[0]["y"] if contact_heads else height
        local = [item for item in items if item["y"] >= head["y"] and item["y"] < next_y and item.get("type") in {"image", "container", "region"}]
        _append_region_if_supported(items, "about-section", [head] + local, "about heading + local visual regions")
        media = [item for item in local if item.get("type") == "image"]
        if media: _append_region_if_supported(items, "map-region", [max(media, key=lambda item: item["width"] * item["height"])], "about section media evidence")
    if contact_heads:
        head = contact_heads[0]
        controls = [item for item in items if item["y"] >= head["y"] and item.get("type") in {"input", "button"}]
        if controls:
            _append_region_if_supported(items, "contact-section", [head] + controls, "contact heading + local controls")
            _append_region_if_supported(items, "form", controls, "input/button geometry below contact heading")
            for item in controls:
                if item.get("type") == "button": item["role"] = item.get("role") or "submit-action"
                if item.get("type") == "input": item["role"] = item.get("role") or "field"
    
    # Suppress ecommerce-specific structures for landing pages
    if not any(item.get("role") in {"gallery", "product-detail", "related-products"} for item in items):
        # Remove thumbnail strips and product-like structures
        items[:] = [item for item in items if item.get("role") not in {"media-thumbnail-strip", "thumbnail-image", "thumbnail-gallery"}]


def fuse_layout_evidence(elements: list[dict], ocr_document: dict | None, canvas: dict) -> list[dict]:
    """Attach macro parents and prevent OCR-backed text from becoming buttons.

    This adds only regions supported by existing macro geometry or OCR grouping.
    It intentionally emits neutral `control-region` / `repeated-region` when
    text or card semantics are not adequately supported.
    """
    items = [dict(item) for item in elements]
    width, height = canvas["width"], canvas["height"]
    words = (ocr_document or {}).get("words", [])
    lines = (ocr_document or {}).get("lines", [])
    main = _region(items, "main")
    gallery = _region(items, "gallery")
    detail = _region(items, "product-detail")
    related = _region(items, "related-products")
    # Product-page specialization is evidence-gated. A two-column density
    # split alone also occurs in dashboards, card grids, and landing pages.
    # Require independent OCR/page evidence before applying product roles.
    semantic_text = " ".join(line.get("text", "").lower() for line in lines)
    product_signals = sum(bool(re.search(pattern, semantic_text)) for pattern in (r"[$€£₹]\s?\d|\d+[.,]\d{2}", r"\breviews?\b|\brating\b", r"\bproduct\b", r"\bsimilar\b|\brelated\b"))
    product_pattern = bool(main and gallery and detail and product_signals >= 2)
    if not product_pattern:
        for item in items:
            if item.get("role") == "gallery": item["role"] = "media-region"
            elif item.get("role") == "product-detail": item["role"] = "section"
            elif item.get("role") == "related-products": item["role"] = "repeated-region"
        gallery = detail = related = None

    header_lines = [line for line in lines if line["y"] < height * .13 and re.search(r"[A-Za-z]", line["text"]) and len(line["text"].split()) <= 2]
    if header_lines and not _region(items, "header"):
        header_bottom = max(120.0, min(height * .23, max(line["y"] + line["height"] for line in header_lines) + 42))
        items.append(_struct("header", 0, 0, width, header_bottom, .78, ["OCR-aligned header text"]))
    header = _region(items, "header")
    if header_lines and header:
        nav_lines = [line for line in header_lines if len(line["text"].split()) <= 2 and not re.search(r"cart|search", line["text"], re.I)]
        if len(nav_lines) >= 2:
            x1=min(line["x"] for line in nav_lines); y1=min(line["y"] for line in nav_lines); x2=max(line["x"]+line["width"] for line in nav_lines); y2=max(line["y"]+line["height"] for line in nav_lines)
            items.append(_struct("nav-group", x1, y1 - 10, x2 - x1, y2 - y1 + 20, .72, ["horizontally aligned OCR nav labels"]))

    # Header word recovery can be more granular than Tesseract's line pass.
    # Prefer the actual nav-link elements when they are available.
    if header and not _region(items, "nav-group"):
        nav_items = [item for item in items if item.get("role") == "nav-link" and _inside(item, header)]
        if len(nav_items) >= 2:
            x, y, rw, rh = _union(nav_items)
            items.append(_struct("nav-group", x, y - 8, rw, rh + 16, .72, ["header OCR word alignment"]))
    
    # Fix CONTACT appearing as button instead of nav-link in header
    if header:
        contact_buttons = [item for item in items if _inside(item, header) and item.get("type") == "button" and item.get("label", "").upper() == "CONTACT"]
        if len(contact_buttons) > 1:
            # Keep only the highest confidence CONTACT button, convert others to nav-link
            contact_buttons.sort(key=lambda x: x.get("confidence", 0), reverse=True)
            for i, button in enumerate(contact_buttons[1:], 1):  # Skip the first (highest confidence)
                button["type"] = "text"
                button["role"] = "nav-link"
        elif len(contact_buttons) == 1:
            # Single CONTACT button - check if it should be nav-link based on position
            nav_group = _region(items, "nav-group")
            if nav_group and _inside(contact_buttons[0], nav_group):
                contact_buttons[0]["type"] = "text"
                contact_buttons[0]["role"] = "nav-link"

    _landing_regions(items, lines, canvas)

    # Product area is the actual union of gallery/detail, clipped below header.
    if product_pattern and not _region(items, "product-area"):
        top = max(gallery["y"], detail["y"], header["y"] + header["height"] if header else 0)
        bottom = min(gallery["y"] + gallery["height"], detail["y"] + detail["height"])
        items.append(_struct("product-area", 0, top, width, max(0, bottom - top), .84, ["gallery/detail macro union"]))

    for item in items:
        label = (item.get("label") or "").strip()
        lowered = label.lower()
        if item["type"] == "button" and not label:
            # No OCR/action evidence: preserve geometry without CTA invention.
            item["type"], item["role"] = "region", "control-region"
            item["uncertainty"] = "unlabeled-contour"
        if label and re.search(r"(?:[$€£₹]\s?\d|\d+[.,]\d{2})", label):
            item["type"], item["role"] = "text", "price"
        elif label and re.search(r"select|model|size|color|option|variant", lowered) and item["width"] > 70:
            item["type"], item["role"] = "input", "select"
        elif label and "search" in lowered and header and _inside(item, header):
            item["type"], item["role"] = "input", "search-input"

    for item in items:
        if item["type"] != "text":
            continue
        label = (item.get("label") or "").strip().lower()
        if re.fullmatch(r"our services|about us|contact us", label):
            item["role"] = "section-heading"
        elif re.fullmatch(r"headline", label):
            item["role"] = "hero-heading"
        if product_pattern and detail and _inside(item, detail):
            if re.search(r"(?:[$€£₹]\s?\d|\d+[.,]\d{2})", label): item["role"] = "price"
            elif "review" in label or "rating" in label: item["role"] = "rating"
            elif "product title" in label: item["role"] = "product-title"
            elif len(label) > 35: item["role"] = "description"
        if product_pattern and related and _inside(item, related) and re.search(r"similar|related", label):
            item["role"] = "section-heading"
        if header and _inside(item, header) and item.get("role") in {"copy", "nav-link"}:
            item["role"] = "cart-action" if "cart" in label else "nav-link"

    # OCR heading plus a lower related-products region is evidence of a grid
    # *region*, not enough evidence to fabricate cards. Keep it explicitly
    # uncertain for validation and future repeat recovery.
    if product_pattern and related and any(item.get("role") == "section-heading" for item in items) and not _region(items, "product-card-grid"):
        items.append(_struct("product-card-grid", related["x"], related["y"] + related["height"] * .28, related["width"], related["height"] * .72, .38, ["related-products macro + OCR section heading"], uncertainty="card boxes not confidently recovered"))
    return items
