"""Validation for untrusted, schema-only vision responses."""
from __future__ import annotations
from typing import Any

REQUIRED = {"pageCategory", "nodes"}
ALLOWED_LAYOUTS = {"row", "column", "grid", "absolute", "mixed", "auto"}

def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)

def _bounds(value: Any) -> None:
    if not isinstance(value, dict) or set(("x", "y", "width", "height")) - set(value):
        raise ValueError("vision bounds require x, y, width, and height")
    if any(not _number(value[key]) or not 0 <= value[key] <= 1 for key in ("x", "y", "width", "height")):
        raise ValueError("vision bounds must be normalized values in [0,1]")
    if value["width"] <= 0 or value["height"] <= 0 or value["x"] + value["width"] > 1.001 or value["y"] + value["height"] > 1.001:
        raise ValueError("vision bounds must remain inside the frame")

def _node(node: Any, ids: set[str]) -> None:
    if not isinstance(node, dict) or not {"id", "type", "role", "bounds"} <= set(node):
        raise ValueError("each vision node requires id, type, role, and bounds")
    if not isinstance(node["id"], str) or not node["id"].strip() or node["id"] in ids:
        raise ValueError("vision node ids must be unique non-empty strings")
    ids.add(node["id"])
    if not isinstance(node["type"], str) or not isinstance(node["role"], str):
        raise ValueError("vision node type and role must be strings")
    _bounds(node["bounds"])
    layout = node.get("layout", {})
    if layout and (not isinstance(layout, dict) or layout.get("direction", "auto") not in ALLOWED_LAYOUTS):
        raise ValueError("vision layout direction is invalid")
    confidence = node.get("confidence", node.get("roleConfidence", 0.5))
    if not _number(confidence) or not 0 <= confidence <= 1:
        raise ValueError("vision confidence must be in [0,1]")
    children = node.get("children", [])
    if not isinstance(children, list):
        raise ValueError("vision children must be a list")
    for child in children: _node(child, ids)

def validate_vision_schema(value: dict) -> dict:
    if not isinstance(value, dict) or not REQUIRED <= set(value):
        raise ValueError("vision response must include pageCategory and nodes")
    if not isinstance(value["pageCategory"], str) or not isinstance(value["nodes"], list):
        raise ValueError("vision pageCategory must be text and nodes must be a list")
    if len(value["nodes"]) > 200: raise ValueError("vision response has too many top-level nodes")
    ids: set[str] = set()
    for node in value["nodes"]: _node(node, ids)
    return value
