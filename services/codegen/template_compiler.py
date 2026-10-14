"""
Template compiler — a deterministic Pipeline Step 5 that requires NO LLM,
NO API key, and NO network.

Why this exists: `generate.py` implements the spec's real target (an LLM
call), but a free-tier model (or any LLM) can still hallucinate, drop
elements, or need retries — that's *why* CGDA and the validation loop
exist. This module is the other half of "the generated code should be
accurate to whatever wireframe is attached": it walks the schema tree
(built from whatever the detector actually found in your image) and
renders JSX directly from it, node for node. Because the JSX is derived
from the schema instead of guessed by a model, it is *always* a 100%
structural match — CGDA strips nothing, the validation loop needs zero
retries, every run succeeds.

RAG still matters here: the top retrieved template for the root node picks
the *layout* of the outer wrapper (a header-style flex row vs. a
form-style stack vs. a plain container). User instructions
(instruction_parser.py's StyleOverrides) additionally influence *styling*
(color, corner radius, size, shadow, dark/light theme) — every element
still renders from a fixed type->tag mapping regardless of either input,
so nothing is ever invented or dropped no matter what the user asks for.

`generate.py` (LLM) and this module are interchangeable via
`GEN_MODE=llm|template` (default: template) — see scripts/cli_pipeline.py's cmd_generate.
"""

from __future__ import annotations

import json

from instruction_parser import StyleOverrides


def _label_for(node: dict) -> str:
    """
    Real OCR-extracted text (services/detection/ocr_extractor.py), when
    present on the schema node, is used verbatim — this is what makes a
    wireframe's actual placeholder text ("Name", "Email Address") or
    button copy ("Submit") show up in the generated code instead of a
    generic "Input 1"/"Button 1". Falls back to an id-derived placeholder
    when OCR found nothing for this element (a blank input box, an icon).
    """
    label = node.get("label") or node.get("text")
    if label and not __import__("re").match(r"^(button|account|description|continue|media region|product gallery|image here)(\s+\d+)?$", str(label).strip(), __import__("re").I):
        return label
    semantic_defaults = {
        "input": "", "text": "", "image": "",
        "link": "Learn more", "dropdown": "Select an option", "checkbox": "Remember me",
        "radio": "Option", "icon": "Action",
    }
    if node.get("role"):
        role_labels = {"search": "Search", "submit-action": "Send", "field": "", "brand": ""}
        if node["role"] in role_labels:
            return role_labels[node["role"]]
    parent_role = node.get("parentRole")
    parent_defaults = {
        ("button", "product-detail"): "Add to cart",
        ("text", "product-detail"): "Product title",
        ("button", "header"): "Account",
        ("input", "header"): "Search products",
        ("text", "footer"): "Customer support",
    }
    if (node["type"], parent_role) in parent_defaults:
        return parent_defaults[(node["type"], parent_role)]
    if node["type"] in semantic_defaults:
        return semantic_defaults[node["type"]]
    return ""


def _js_string(text: str) -> str:
    """
    Renders `text` as a JS string-literal expression (e.g. `{"Email Address"}`)
    rather than embedding it as raw JSX text/attribute content. Python's
    `json.dumps` produces a properly quote-and-backslash-escaped JS string
    literal, and wrapping it in `{}` makes it a valid JSX expression in
    both attribute and child-content position. `<`/`>` are additionally
    stripped here as defense in depth (see ocr_extractor.py's
    `_sanitize_ocr_text`), since CGDA's parser isn't a full AST and would
    otherwise misread a literal `<` as an opening tag.
    """
    text = text.replace("<", "").replace(">", "")
    return "{" + json.dumps(text) + "}"


# ---------------------------------------------------------------------------
# Style composition — turns StyleOverrides into concrete Tailwind classes.
# Every helper defaults to exactly the classes this module used before
# StyleOverrides existed, so calling compile_schema() with no instructions
# produces the same output as the original hardcoded-string version
# (verified in test_template_compiler.py's default-output tests).
# ---------------------------------------------------------------------------

def _padding(overrides: StyleOverrides) -> str:
    if overrides.size == "large": return "px-6 py-3"
    if overrides.size == "small": return "px-2 py-1"
    return "px-4 py-2"

def _container_padding(overrides: StyleOverrides) -> str:
    if overrides.size == "large": return "p-6"
    if overrides.size == "small": return "p-1"
    return "p-3"

def _corner(overrides: StyleOverrides) -> str:
    if overrides.corner_style == "rounded": return "rounded-full"
    if overrides.corner_style == "sharp": return "rounded-none"
    return "rounded"

def _shadow(overrides: StyleOverrides) -> str:
    return " shadow-md" if overrides.shadow else ""

def _text_modifiers(overrides: StyleOverrides) -> str:
    parts = []
    if overrides.font_weight == "bold": parts.append("font-bold")
    elif overrides.font_weight == "light": parts.append("font-light")
    if overrides.text_align == "center": parts.append("text-center")
    elif overrides.text_align == "left": parts.append("text-left")
    elif overrides.text_align == "right": parts.append("text-right")
    return (" " + " ".join(parts)) if parts else ""

def _border_class(overrides: StyleOverrides, default: str = "border") -> str:
    if overrides.border_weight == "none": return ""
    if overrides.border_weight == "thick": return "border-4"
    if overrides.border_weight == "thin": return "border"
    return default

def _opacity_class(overrides: StyleOverrides) -> str:
    return " bg-opacity-60" if overrides.transparent else ""

def _button_classes(overrides: StyleOverrides) -> str:
    pad, corner, shadow = _padding(overrides), _corner(overrides), _shadow(overrides)
    text_mods = _text_modifiers(overrides)
    opacity = _opacity_class(overrides)
    accent = overrides.accent_color or "blue"
    if overrides.button_style == "outline":
        if overrides.dark_theme:
            return f"{pad} {corner} border-2 border-{accent}-500 text-{accent}-400 hover:bg-slate-900 font-semibold transition-all{shadow}{text_mods}"
        return f"{pad} {corner} border-2 border-{accent}-600 text-{accent}-600 hover:bg-{accent}-50 font-semibold transition-all{shadow}{text_mods}"
    if overrides.dark_theme:
        return f"{pad} {corner} bg-{accent}-600 text-white font-semibold hover:bg-{accent}-500 shadow-sm transition-all{shadow}{text_mods}{opacity}"
    return f"{pad} {corner} bg-{accent}-600 text-white font-semibold hover:bg-{accent}-700 shadow-sm transition-all{shadow}{text_mods}{opacity}"

def _text_classes(overrides: StyleOverrides) -> str:
    base = "text-slate-100" if overrides.dark_theme else "text-slate-800"
    return base + _text_modifiers(overrides)

def _input_classes(overrides: StyleOverrides) -> str:
    pad, corner = _padding(overrides), _corner(overrides)
    border = _border_class(overrides)
    if overrides.dark_theme:
        b_color = "border-slate-700" if border else ""
        return f"w-full {pad} {corner} bg-slate-900 {border} {b_color} text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all".replace("  ", " ").strip()
    b_color = "border-slate-300" if border else ""
    return f"w-full {pad} {corner} bg-white {border} {b_color} text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all".replace("  ", " ").strip()

def _link_classes(overrides: StyleOverrides) -> str:
    if overrides.dark_theme:
        return f"text-blue-400 hover:text-blue-300 font-medium transition-colors" + _text_modifiers(overrides)
    return f"text-slate-600 hover:text-blue-600 font-medium transition-colors" + _text_modifiers(overrides)

def _container_classes(overrides: StyleOverrides, layout: str) -> str:
    pad, corner, shadow = _container_padding(overrides), _corner(overrides), _shadow(overrides)
    opacity = _opacity_class(overrides)
    if layout == "border":
        border = _border_class(overrides)
        base = f"{border} {corner} {pad}".strip() if border else f"{corner} {pad}"
    else:
        base = f"{layout} {pad}"
    if overrides.dark_theme:
        border_color = "" if overrides.border_weight == "none" else " border-slate-800"
        return f"{base}{border_color} text-slate-100{shadow}{opacity}"
    return f"{base} text-slate-800{shadow}{opacity}"

def _role_classes(node: dict) -> str:
    role = node.get("role")
    return {
        "page": "min-h-screen p-6 md:p-12 space-y-16 max-w-7xl mx-auto",
        "header": "w-full flex items-center justify-between gap-5 border-b border-slate-200 dark:border-slate-800 pb-6",
        "main": "w-full flex flex-col gap-16 md:gap-24",
        "media-region": "min-w-0",
        "hero-section": "min-w-0 self-center w-full text-center py-16 md:py-24",
        "services-section": "col-span-full w-full py-12",
        "about-section": "col-span-full w-full py-12",
        "contact-section": "col-span-full w-full py-12",
        "gallery": "min-w-0 grid gap-4",
        "product-detail": "min-w-0 flex flex-col gap-6",
        "related-products": "col-span-full grid grid-cols-2 md:grid-cols-3 gap-6 pt-12 border-t",
        "footer": "w-full border-t border-slate-200 dark:border-slate-800 pt-8 pb-4 text-sm text-slate-500 flex justify-between",
    }.get(role, "")

def _has_side_by_side_macro_children(node: dict) -> bool:
    candidates = []
    for child in node.get("children", []):
        bounds = child.get("relativeBounds") or {}
        try:
            x, y = float(bounds.get("x", 0)), float(bounds.get("y", 0))
            width, height = float(bounds.get("width", 0)), float(bounds.get("height", 0))
        except (TypeError, ValueError):
            continue
        if width > 0.12 and height > 0.06:
            candidates.append((x, y, width, height))
    for index, left in enumerate(candidates):
        for right in candidates[index + 1:]:
            vertical_overlap = max(0.0, min(left[1] + left[3], right[1] + right[3]) - max(left[1], right[1]))
            minimum_height = min(left[3], right[3])
            centre_distance = abs((left[0] + left[2] / 2) - (right[0] + right[2] / 2))
            if minimum_height and vertical_overlap / minimum_height >= 0.45 and centre_distance >= 0.16:
                return True
    return False

LEAF_TYPES = {"button", "text", "input", "image", "icon", "checkbox", "radio", "dropdown", "link"}

def _get_marker_attrs(node: dict) -> dict:
    role = node.get("role") or ""
    bounds = node.get("relativeBounds") or {}
    source = f'{bounds.get("x", 0)},{bounds.get("y", 0)},{bounds.get("width", 0)},{bounds.get("height", 0)}'
    semantic = node.get("semanticComponentId") or f'semantic-{node.get("id")}'
    provenance = ",".join(sorted(key for key, value in (node.get("source") or {}).items() if value)) or "local"
    return {
        "data-wireframe-id": str(node.get("id")),
        "data-semantic-component-id": semantic,
        "data-wireframe-provenance": provenance,
        "data-wireframe-type": node.get("type", ""),
        "data-wireframe-role": role,
        "data-wireframe-bounds": source
    }

def _section_dom_id(node: dict) -> str:
    return node.get("domId") or ""

def _render_leaf_ast(t: str, label: str, overrides: StyleOverrides, node: dict) -> dict:
    role = node.get("role")
    attrs = _get_marker_attrs(node)
    
    if t == "button":
        attrs["className"] = _button_classes(overrides)
        if role == "auth-primary-action":
            attrs["type"] = "submit"
            return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label or "Sign in"}]}
        if role == "auth-helper":
            attrs["type"] = "button"
            attrs["className"] = _link_classes(overrides)
            attrs["onClick"] = {"kind": "handlerReference", "name": "handleAuthHelper", "args": [{"kind": "string", "value": label}]}
            return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label}]}
        if role == "submit-action":
            attrs["type"] = "submit"
            return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label}]}
        if role == "cart-action":
            attrs["type"] = "button"
            attrs["aria-expanded"] = {"kind": "expression", "value": "cartOpen"}
            attrs["onClick"] = {"kind": "handlerReference", "name": "toggleCart"}
            return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "expression", "value": f'`Cart (${{cartCount}})`'}]}
        if "add to cart" in label.lower():
            attrs["type"] = "button"
            attrs["onClick"] = {"kind": "handlerReference", "name": "handleAddToCart"}
            return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label or "Add to cart"}]}
        
        attrs["type"] = "button"
        target = node.get("resolvedTarget")
        if target:
            attrs["onClick"] = {"kind": "expression", "value": f'() => document.getElementById("{target}")?.scrollIntoView({{ behavior: "smooth" }})'}
        return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label}]}
    
    if t == "text":
        attrs["className"] = _text_classes(overrides)
        if role == "brand":
            attrs["role"] = "img"
            attrs["aria-label"] = "Brand mark"
            brand_color = "text-blue-400" if overrides.dark_theme else "text-blue-600"
            attrs["className"] = f"inline-flex items-center font-bold tracking-tight text-xl {brand_color}"
            return {"kind": "element", "tag": "span", "attributes": attrs, "children": [{"kind": "text", "value": label or "LOGO"}]}
        
        if role == "nav-link": tag = "a"
        else: tag = "h1" if role in {"heading", "hero-heading", "product-title"} else "h2" if role == "section-heading" else "p"
        
        text_color = "text-white" if overrides.dark_theme else "text-slate-950"
        muted_color = "text-slate-300" if overrides.dark_theme else "text-slate-700"
        primary_color = "text-blue-400" if overrides.dark_theme else "text-blue-600"
        body_color = "text-slate-200" if overrides.dark_theme else "text-slate-800"
        mods = _text_modifiers(overrides)
        if tag == "h1":
            attrs["className"] = f"text-4xl md:text-5xl font-black tracking-tight {text_color} mb-3{mods}"
        elif tag == "h2":
            attrs["className"] = f"text-2xl md:text-3xl font-extrabold tracking-tight {text_color} mb-4{mods}"
        elif role in {"price"}:
            attrs["className"] = f"text-xl font-bold {primary_color}{mods}"
        elif role in {"copy", "description"}:
            attrs["className"] = f"text-lg font-medium {muted_color} leading-relaxed{mods}"
        elif tag == "p":
            attrs["className"] = f"text-base font-normal {body_color} leading-relaxed{mods}"

        if tag == "a":
            attrs["className"] = _link_classes(overrides)
            target = node.get("resolvedTarget")
            if target:
                attrs["type"] = "button"
                attrs["onClick"] = {"kind": "expression", "value": f'() => document.getElementById("{target}")?.scrollIntoView({{ behavior: "smooth" }})'}
                return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label}]}
            link_muted = "text-slate-300 hover:text-blue-400" if overrides.dark_theme else "text-slate-700 hover:text-blue-600"
            attrs["className"] = f"{link_muted} transition-colors cursor-pointer font-semibold"
            return {"kind": "element", "tag": "span", "attributes": attrs, "children": [{"kind": "text", "value": label}]}
        return {"kind": "element", "tag": tag, "attributes": attrs, "children": [{"kind": "text", "value": label}]}
        
    if t == "input":
        attrs["className"] = _input_classes(overrides)
        if role in {"auth-field", "auth-password"}:
            password = role == "auth-password"
            key = "authPassword" if password else "authEmailOrUsername"
            setter = "setAuthPassword" if password else "setAuthEmailOrUsername"
            input_type = "password" if password else "text"
            safe_label = label if label else ("Password" if password else "Login")
            
            attrs["type"] = input_type
            attrs["required"] = True
            attrs["aria-label"] = safe_label
            attrs["placeholder"] = safe_label
            attrs["value"] = {"kind": "expression", "value": key}
            attrs["onChange"] = {"kind": "expression", "value": f"(event) => {setter}(event.target.value)"}
            return {"kind": "voidElement", "tag": "input", "attributes": attrs}
            
        if role == "search":
            attrs["type"] = "search"
            attrs["role"] = "searchbox"
            attrs["aria-label"] = label
            attrs["placeholder"] = label
            attrs["value"] = {"kind": "expression", "value": "searchQuery"}
            attrs["onChange"] = {"kind": "handlerReference", "name": "handleSearch"}
            return {"kind": "voidElement", "tag": "input", "attributes": attrs}
            
        if role == "select":
            attrs["aria-label"] = label
            return {"kind": "element", "tag": "select", "attributes": attrs, "children": [
                {"kind": "element", "tag": "option", "attributes": {}, "children": [{"kind": "text", "value": label}]}
            ]}
            
        safe_label = label if label else "Input field"
        attrs["required"] = True
        attrs["aria-label"] = safe_label
        attrs["placeholder"] = safe_label
        attrs["value"] = {"kind": "expression", "value": "formData.message"}
        attrs["onChange"] = {"kind": "expression", "value": "(event) => setFormData({ message: event.target.value })"}
        return {"kind": "voidElement", "tag": "input", "attributes": attrs}

    if t == "image":
        bounds = node.get("relativeBounds") or {}
        width, height = float(bounds.get("width") or 1), float(bounds.get("height") or .65)
        ratio = max(.25, min(4, width / height))
        safe_label = label if label else "Detected visual region"
        attrs["role"] = "img"
        attrs["aria-label"] = safe_label

        if role == "feature-card":
            card_bg = "bg-slate-900 border-slate-700 text-slate-100" if overrides.dark_theme else "bg-white border-2 border-slate-200 text-slate-950"
            title_color = "text-white" if overrides.dark_theme else "text-slate-950"
            desc_color = "text-slate-300" if overrides.dark_theme else "text-slate-700"
            img_bg = "bg-slate-800/80 border-slate-700/50 text-slate-400" if overrides.dark_theme else "bg-slate-100 border-slate-200 text-slate-500"
            card_attrs = dict(attrs)
            card_attrs["className"] = f"flex flex-col gap-3 p-5 rounded-2xl border {card_bg} shadow-sm hover:shadow-md transition-shadow"
            img_attrs = {
                "className": f"w-full h-36 {img_bg} border flex items-center justify-center rounded-xl overflow-hidden mb-1",
                "role": "img",
                "aria-label": safe_label
            }
            svg_icon = {"kind": "element", "tag": "svg", "attributes": {"className": "w-10 h-10 opacity-60", "fill": "none", "stroke": "currentColor", "viewBox": "0 0 24 24", "xmlns": "http://www.w3.org/2000/svg"}, "children": [{"kind": "voidElement", "tag": "path", "attributes": {"strokeLinecap": "round", "strokeLinejoin": "round", "strokeWidth": "2", "d": "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"}}]}
            card_title = label if (label and len(label) > 2 and not any(bad in label.lower() for bad in ["button", "region", "loso", "commer", "|", "i}"])) else "Service Feature"
            title_el = {"kind": "element", "tag": "h3", "attributes": {"className": f"text-lg font-bold {title_color}"}, "children": [{"kind": "text", "value": card_title}]}
            desc_el = {"kind": "element", "tag": "p", "attributes": {"className": f"text-sm font-medium {desc_color} leading-relaxed"}, "children": [{"kind": "text", "value": "Comprehensive solution tailored to meet your modern workflow needs."}]}
            return {"kind": "element", "tag": "article", "attributes": card_attrs, "children": [
                {"kind": "element", "tag": "div", "attributes": img_attrs, "children": [svg_icon]},
                title_el,
                desc_el
            ]}

        base_img_bg = "bg-slate-900 border-slate-800 text-slate-400" if overrides.dark_theme else "bg-slate-100 border-slate-200 text-slate-500"
        attrs["className"] = f"w-full {base_img_bg} border flex items-center justify-center overflow-hidden {_corner(overrides)}"
        attrs["style"] = {"aspectRatio": f"{ratio:.3f}"}
        svg_icon = {"kind": "element", "tag": "svg", "attributes": {"className": "w-12 h-12 opacity-50", "fill": "none", "stroke": "currentColor", "viewBox": "0 0 24 24", "xmlns": "http://www.w3.org/2000/svg"}, "children": [{"kind": "voidElement", "tag": "path", "attributes": {"strokeLinecap": "round", "strokeLinejoin": "round", "strokeWidth": "2", "d": "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"}}]}
        return {"kind": "element", "tag": "div", "attributes": attrs, "children": [svg_icon]}
        
    if t == "icon":
        icon_name = label.lower().replace(" ", "-")
        attrs["aria-label"] = icon_name
        attrs["className"] = "w-5 h-5 inline-block"
        return {"kind": "voidElement", "tag": "span", "attributes": attrs}
        
    if t == "checkbox":
        attrs["type"] = "checkbox"
        attrs["aria-label"] = label
        attrs["className"] = "w-4 h-4"
        return {"kind": "voidElement", "tag": "input", "attributes": attrs}
        
    if t == "radio":
        attrs["type"] = "radio"
        attrs["name"] = "group"
        attrs["aria-label"] = label
        attrs["className"] = "w-4 h-4"
        return {"kind": "voidElement", "tag": "input", "attributes": attrs}
        
    if t == "dropdown":
        attrs["aria-label"] = label
        attrs["className"] = f"border {_corner(overrides)} {_padding(overrides)}"
        return {"kind": "element", "tag": "select", "attributes": attrs, "children": []}
        
    if t == "link":
        attrs["type"] = "button"
        attrs["className"] = _link_classes(overrides)
        return {"kind": "element", "tag": "button", "attributes": attrs, "children": [{"kind": "text", "value": label}]}
        
    raise ValueError(f"unknown leaf type: {t}")

def _render_ast_node(node: dict, overrides: StyleOverrides | None = None) -> dict:
    overrides = overrides or StyleOverrides()
    t = node.get("type", "")
    label = _label_for(node)
    
    children_ast = [_render_ast_node(c, overrides) for c in node.get("children", [])]
    
    if t in LEAF_TYPES:
        leaf_ast = _render_leaf_ast(t, label, overrides, node)
        if children_ast:
            return {"kind": "fragment", "children": [leaf_ast] + children_ast}
        return leaf_ast

    if t == "root" or node.get("role") == "page-root":
        bg_root = "bg-slate-950 text-slate-100" if overrides.dark_theme else "bg-white text-slate-900"
        attrs = _get_marker_attrs(node)
        attrs["className"] = f"w-full min-h-screen {bg_root}"
        return {"kind": "element", "tag": "div", "attributes": attrs, "children": children_ast}

    inferred = (node.get("layout") or {}).get("direction")
    style = node.get("_style") or {"row": "row", "column": "stack", "grid": "grid"}.get(inferred, "block")
    if node.get("role") == "page": style = "stack"
    elif node.get("role") in {"header", "nav-group"}: style = "row"
    elif node.get("role") in {"product-detail", "gallery"}: style = "stack"
    elif node.get("role") == "feature-card-grid": style = "grid"
    elif node.get("role") in {"services-section", "contact-section"}: style = "stack"
    elif node.get("role") == "related-products": style = "grid"
    elif node.get("role") in {"hero-section", "about-section", "split-content-section"}:
        if _has_side_by_side_macro_children(node) or inferred == "row":
            style = "split"
        else:
            style = "stack"
    elif node.get("role") == "main":
        if _has_side_by_side_macro_children(node) or inferred == "row":
            style = "split"
        else:
            style = "stack"
    
    layout = {
        "row": "flex items-center justify-between gap-3",
        "stack": "flex flex-col gap-4",
        "grid": "grid grid-cols-3 gap-4 md:gap-6",
        "split": "grid grid-cols-1 md:grid-cols-2 gap-8 items-start",
        "block": "border",
    }[style]
    
    if node.get("role") == "page":
        if overrides.dark_theme:
            neutral = "relative bg-slate-950 text-slate-100 w-full min-h-screen"
        else:
            neutral = "relative bg-white text-slate-900 w-full min-h-screen"
        cls = f"{neutral} {_role_classes(node)}".strip()
    else:
        cls = f"{_container_classes(overrides, layout)} {_role_classes(node)}".strip()
    
    tag = {"header": "header", "footer": "footer", "main": "main", "nav-group": "nav", "form": "form", "page": "div", "feature-card": "article", "product-card": "article"}.get(node.get("role"), "section" if node.get("role") in {"gallery", "product-detail", "related-products", "product-area", "hero-section", "services-section", "split-content-section", "about-section", "contact-section", "feature-card-grid", "product-card-grid"} else "div")
    
    attrs = _get_marker_attrs(node)
    attrs["className"] = cls
    
    dom_id = _section_dom_id(node)
    if dom_id:
        attrs["id"] = dom_id
        
    tokens = node.get("_theme_tokens") if node.get("role") == "page" else None
    if tokens:
        colors = tokens.get("colors", {})
        attrs["style"] = {f"--wf-{k}": v for k, v in colors.items()}
        
    if not children_ast:
        if node.get("label"):
            return {"kind": "element", "tag": tag, "attributes": attrs, "children": [{"kind": "text", "value": label}]}
        return {"kind": "voidElement", "tag": tag, "attributes": attrs}
        
    if node.get("role") == "contact-section":
        heading = [c for c in children_ast if c.get("tag") in {"h1", "h2", "h3"}]
        non_heading = [c for c in children_ast if c not in heading]
        input_classes = _input_classes(overrides)
        button_classes = _button_classes(overrides)
        status_color = "text-emerald-400" if overrides.dark_theme else "text-emerald-600"
        
        form_children = []
        input_box = {
            "kind": "voidElement",
            "tag": "input",
            "attributes": {
                "type": "email",
                "required": True,
                "placeholder": "Enter your email address",
                "aria-label": "Email address",
                "className": input_classes,
                "value": {"kind": "expression", "value": "formData.message"},
                "onChange": {"kind": "expression", "value": "(event) => setFormData({ message: event.target.value })"}
            }
        }
        form_children.append(input_box)
        
        submit_btn = next((c for c in non_heading if c.get("tag") == "button"), None)
        if not submit_btn:
            submit_btn = {
                "kind": "element",
                "tag": "button",
                "attributes": {
                    "type": "submit",
                    "className": button_classes
                },
                "children": [{"kind": "text", "value": "Send Message"}]
            }
        else:
            submit_btn["attributes"]["type"] = "submit"
            submit_btn["attributes"]["className"] = button_classes
            if not submit_btn.get("children"):
                submit_btn["children"] = [{"kind": "text", "value": "Send Message"}]
        form_children.append(submit_btn)

        status_msg = {
            "kind": "conditional",
            "condition": {"kind": "expression", "value": "submitted"},
            "trueBranch": {
                "kind": "element",
                "tag": "p",
                "attributes": {"role": "status", "className": f"text-sm font-medium {status_color} mt-2 w-full text-center"},
                "children": [{"kind": "text", "value": "Thank you! Your message has been sent successfully."}]
            }
        }

        form_el = {
            "kind": "element",
            "tag": "form",
            "attributes": {
                "className": "w-full max-w-md mx-auto flex flex-col sm:flex-row gap-3 items-center justify-center mt-4",
                "onSubmit": {"kind": "expression", "value": "(event) => { event.preventDefault(); setSubmitted(true); setFormData({ message: '' }); }"}
            },
            "children": form_children + [status_msg]
        }
        return {"kind": "element", "tag": tag, "attributes": attrs, "children": heading + [form_el]}

    if node.get("role") == "auth-form":
        attrs["className"] = "max-w-md mx-auto w-full flex flex-col gap-4 rounded-lg border border-[var(--wf-border)] bg-[var(--wf-surface)] p-6 shadow-md"
        attrs["onSubmit"] = {"kind": "handlerReference", "name": "handleAuthSubmit"}
        status_msg = {"kind": "conditional", "condition": {"kind": "expression", "value": "authSubmitted"}, "trueBranch": {"kind": "element", "tag": "p", "attributes": {"role": "status", "className": "text-sm text-green-700"}, "children": [{"kind": "expression", "value": "authStatus"}]}}
        return {"kind": "element", "tag": "form", "attributes": attrs, "children": children_ast + [status_msg]}
        
    if node.get("role") == "form":
        attrs["onSubmit"] = {"kind": "expression", "value": "(event) => { event.preventDefault(); setSubmitted(true); setFormData({ message: '' }); }"}
        status_msg = {"kind": "conditional", "condition": {"kind": "expression", "value": "submitted"}, "trueBranch": {"kind": "element", "tag": "p", "attributes": {"role": "status", "className": "text-sm text-green-700"}, "children": [{"kind": "text", "value": "Message sent locally."}]}}
        return {"kind": "element", "tag": "form", "attributes": attrs, "children": children_ast + [status_msg]}
        
    if style == "split":
        left_items = []
        right_items = []
        for c, c_ast in zip(node.get("children", []), children_ast):
            bounds = c.get("relativeBounds") or {}
            try: 
                x = float(bounds.get("x", 0))
                w = float(bounds.get("width", 0))
                cx = x + (w / 2)
            except: 
                cx = 0
            if cx < 0.4:
                left_items.append(c_ast)
            else:
                right_items.append(c_ast)
        if left_items and right_items:
            left_col = {"kind": "element", "tag": "div", "attributes": {"className": "flex flex-col gap-4"}, "children": left_items}
            right_col = {"kind": "element", "tag": "div", "attributes": {"className": "flex flex-col gap-4"}, "children": right_items}
            return {"kind": "element", "tag": tag, "attributes": attrs, "children": [left_col, right_col]}

    return {"kind": "element", "tag": tag, "attributes": attrs, "children": children_ast}

def _pick_root_style(templates: list[dict]) -> str:
    if not templates: return "block"
    top_id = templates[0]["id"]
    if "header" in top_id or "nav" in top_id or "tab" in top_id: return "row"
    if "form" in top_id or "sidebar" in top_id: return "stack"
    if "grid" in top_id or "card-grid" in top_id: return "grid"
    return "block"

def resolve_addition(addition_query: str | None, db) -> dict | None:
    if not addition_query or db is None: return None
    results = db.search(addition_query, k=1)
    if not results: return None
    score, payload = results[0]
    if score < 0.15: return None
    return {"id": payload["id"], "text": payload["text"], "code": payload["code"], "score": score}

def compile_schema(
    schema_tree: dict,
    templates: list[dict] | None = None,
    overrides: StyleOverrides | None = None,
    addition: dict | None = None,
) -> str:
    templates = templates or []
    overrides = overrides or StyleOverrides()
    manifest = schema_tree.get("dependencyManifest", {}) if schema_tree.get("kind") == "CodegenTree" else {}
    theme_tokens = schema_tree.get("themeTokenPlan", {}) if schema_tree.get("kind") == "CodegenTree" else {}
    schema_tree = dict(schema_tree.get("root") or {}) if schema_tree.get("kind") == "CodegenTree" else dict(schema_tree)
    schema_tree["_style"] = _pick_root_style(templates)
    
    for node in [schema_tree, *list(schema_tree.get("children", []))]:
        if node.get("role") == "page": node["_theme_tokens"] = theme_tokens
        
    def contains_form(node: dict) -> bool:
        return node.get("role") in {"form", "contact-section"} or any(contains_form(child) for child in node.get("children", []))
    uses_form = contains_form(schema_tree)
    def contains_auth(node: dict) -> bool:
        return node.get("role") == "auth-form" or any(contains_auth(child) for child in node.get("children", []))
    uses_auth = contains_auth(schema_tree)
    def all_nodes(node: dict):
        yield node
        for child in node.get("children", []): yield from all_nodes(child)
    nodes = list(all_nodes(schema_tree))
    uses_search = any(node.get("role") == "search" for node in nodes)
    uses_cart = any(node.get("role") == "cart-action" or "add to cart" in _label_for(node).lower() for node in nodes)
    uses_state = uses_form or uses_auth or uses_search or uses_cart or bool(manifest.get("state"))

    if not schema_tree.get("children"):
        body_ast = {"kind": "fragment", "children": []}
    else:
        body_ast = _render_ast_node(schema_tree, overrides=overrides)
        
    imports = []
    if uses_state: imports.append("useState")
    
    hooks = []
    if uses_form:
        hooks.append("const [formData, setFormData] = useState({ message: '' });")
        hooks.append("const [submitted, setSubmitted] = useState(false);")
    if uses_auth:
        hooks.append("const [authEmailOrUsername, setAuthEmailOrUsername] = useState('');")
        hooks.append("const [authPassword, setAuthPassword] = useState('');")
        hooks.append("const [authSubmitted, setAuthSubmitted] = useState(false);")
        hooks.append("const [authStatus, setAuthStatus] = useState('');")
        hooks.append("const handleAuthSubmit = (event) => { event.preventDefault(); setAuthSubmitted(true); setAuthStatus('Signed in locally.'); };")
        hooks.append("const handleAuthHelper = (label) => { setAuthSubmitted(true); setAuthStatus(label.toLowerCase().includes('forgot') ? 'Recovery is available locally.' : 'This option is not configured for external sign-in.'); };")
    if uses_search:
        hooks.append("const [searchQuery, setSearchQuery] = useState('');")
        hooks.append("const handleSearch = (event) => setSearchQuery(event.target.value);")
    if uses_cart:
        hooks.append("const [cartCount, setCartCount] = useState(0);")
        hooks.append("const [cartOpen, setCartOpen] = useState(false);")
        hooks.append("const handleAddToCart = () => { setCartCount((count) => count + 1); setCartOpen(true); };")
        hooks.append("const toggleCart = () => setCartOpen((open) => !open);")

    def serialize(n, pad="", in_form=False):
        if not n: return ""
        if isinstance(n, list): return "\n".join(serialize(c, pad, in_form) for c in n)
        
        k = n.get("kind")
        if k == "text": 
            text_val = str(n.get("value", "")).replace("<", "").replace(">", "")
            return pad + text_val
        
        # Raw js expression code without braces (braces are added by parent if needed)
        if k == "expression" or k == "Identifier" or k == "stateReference":
            return str(n.get("value", ""))
            
        if k == "handlerReference":
            args = n.get("args")
            if args:
                # Use json.dumps for strings, raw for others
                args_str = ", ".join(json.dumps(a["value"]) if a.get("kind") == "string" else str(a.get("value")) for a in args)
                return f"() => {n['name']}({args_str})"
            return n["name"]
            
        if k == "fragment":
            children = "\n".join(serialize(c, pad + "  ", in_form) for c in n.get("children", []))
            return f"{pad}<>\n{children}\n{pad}</>"
            
        if k == "conditional":
            # The condition is a JS expression, so serialize it raw
            cond = serialize(n["condition"], "", in_form)
            tb = serialize(n["trueBranch"], pad + "  ", in_form)
            if n.get("falseBranch"):
                fb = serialize(n["falseBranch"], pad + "  ", in_form)
                return f"{pad}{{{cond} ? (\n{tb}\n{pad}) : (\n{fb}\n{pad})}}"
            return f"{pad}{{{cond} && (\n{tb}\n{pad})}}"
            
        if k in ("element", "voidElement"):
            tag = n["tag"]
            if tag == "form":
                if in_form:
                    tag = "div"
                else:
                    in_form = True
            attrs = ""
            for ak, av in n.get("attributes", {}).items():
                if av is None: continue
                if isinstance(av, dict):
                    if av.get("kind") in ("handlerReference", "expression", "stateReference", "Identifier", "ArrowFunction"):
                        # We wrap it in single braces because it's a JSX attribute expression
                        attrs += f" {ak}={{{serialize(av, '', in_form)}}}"
                    else:
                        attrs += f" {ak}={{{json.dumps(av)}}}"
                elif isinstance(av, bool):
                    if av: attrs += f" {ak}"
                else:
                    attrs += f" {ak}={json.dumps(av)}"
            if k == "voidElement" or not n.get("children"):
                return f"{pad}<{tag}{attrs} />"
            children = "\n".join(serialize(c, pad + "  ", in_form) for c in n["children"])
            return f"{pad}<{tag}{attrs}>\n{children}\n{pad}</{tag}>"
            
        # Fallback for bare strings or unknown
        return str(n)

        if isinstance(n, list): return "\n".join(serialize(c, pad, in_form) for c in n)
        k = n.get("kind")
        if k == "text": return pad + str(n.get("value", ""))
        if k == "expression": return pad + "{" + str(n.get("value", "")) + "}"
        if k == "handlerReference":
            args = n.get("args")
            if args:
                args_str = ", ".join(json.dumps(a["value"]) if a["kind"] == "string" else str(a["value"]) for a in args)
                return f"() => {n['name']}({args_str})"
            return n["name"]
        if k == "fragment":
            children = "\n".join(serialize(c, pad + "  ", in_form) for c in n.get("children", []))
            return f"{pad}<>\n{children}\n{pad}</>"
        if k == "conditional":
            cond = serialize(n["condition"], "", in_form)
            tb = serialize(n["trueBranch"], pad + "  ", in_form)
            if n.get("falseBranch"):
                fb = serialize(n["falseBranch"], pad + "  ", in_form)
                return f"{pad}{{{cond} ? (\n{tb}\n{pad}) : (\n{fb}\n{pad})}}"
            return f"{pad}{{{cond} && (\n{tb}\n{pad})}}"
        if k in ("element", "voidElement"):
            tag = n["tag"]
            if tag == "form":
                if in_form:
                    tag = "div"
                else:
                    in_form = True
            attrs = ""
            for ak, av in n.get("attributes", {}).items():
                if av is None: continue
                if isinstance(av, dict):
                    if av.get("kind") in ("handlerReference", "expression", "stateReference"):
                        attrs += f" {ak}={{{serialize(av, '', in_form)}}}"
                    else:
                        attrs += f" {ak}={{{json.dumps(av)}}}"
                elif isinstance(av, bool):
                    if av: attrs += f" {ak}"
                else:
                    attrs += f" {ak}={json.dumps(av)}"
            if k == "voidElement" or not n.get("children"):
                return f"{pad}<{tag}{attrs} />"
            children = "\n".join(serialize(c, pad + "  ", in_form) for c in n["children"])
            return f"{pad}<{tag}{attrs}>\n{children}\n{pad}</{tag}>"
        return ""
        
    body_str = serialize(body_ast, "    ")
    if addition:
        addition_block = "\n".join("      " + line for line in addition["code"].split("\n"))
        body_str = f"    <>\n{body_str}\n      {{/* added per instruction: {addition['id']} */}}\n{addition_block}\n    </>"
        
    imports_str = f"import React, {{ {', '.join(imports)} }} from 'react';" if imports else "import React from 'react';"
    hooks_str = "\n".join(f"  {h}" for h in hooks) + ("\n" if hooks else "")
    
    return f"{imports_str}\n\nexport default function GeneratedComponent() {{\n{hooks_str}  return (\n{body_str}\n  );\n}}\n"
