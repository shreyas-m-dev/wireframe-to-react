"""Provider-neutral strict-layout prompt and JSON extraction."""
from __future__ import annotations
import json

SYSTEM_PROMPT = """You are a UI layout analyst. Inspect the entire supplied wireframe or screen. Return JSON only, never markdown, JSX, HTML, CSS, URLs, or code. Recover a complete hierarchical page tree. Preserve geometry and reading order before guessing semantics. Use neutral roles such as region, horizontal-group, vertical-group, or repeated-group when uncertain. Do not invent text, sections, or controls. Bounds are normalized x/y/width/height in [0,1]. Every node has unique id, type, role, bounds, confidence, layout {direction,columns,gap}, styleHints, uncertainty, evidence, and children. Include pageCategory, frame, styleHints, nodes. Respect design instructions only for style; image evidence controls layout."""

GEMINI_SYSTEM_PROMPT = """Return JSON only, without prose or fences. Inspect the entire image. Use exactly this shallow shape: {page_type, style?, sections:[{id,kind,label?,bounds:[x,y,width,height],layout,columns,items:[{id,kind,label?,bounds:[x,y,width,height],confidence}],confidence}],notes?}. page_type MUST be exactly one of these lowercase strings: landing, ecommerce, dashboard, auth, generic. Do not use landing-page, homepage, marketing, product-page, store, admin-panel, analytics, login-page, website, webpage, unknown, or any other value; if uncertain use generic. Section kind is header|hero|content|cards|split|about|contact|footer|product|related|form|generic. Item kind is logo|nav|heading|text|button|input|select|media|map|card|divider|icon|generic. Bounds are normalized 0..1, sections/items are in reading order, labels are short, use generic when uncertain. Preserve visible sections and repeated groups. Do not emit React, HTML, JSX, URLs, or invented content."""

def user_prompt(instructions: str = "") -> str:
    return "Analyze the image and return the strict layout JSON contract." + (f"\nOptional styling instructions: {instructions.strip()[:1500]}" if instructions.strip() else "")

def parse_json_content(content: object) -> dict:
    if not isinstance(content, str): raise ValueError("vision provider returned no textual JSON")
    text = content.strip()
    if text.startswith("```"): text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    value = json.loads(text)
    if not isinstance(value, dict): raise ValueError("vision provider response must be a JSON object")
    return value
