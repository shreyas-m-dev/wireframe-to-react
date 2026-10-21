"""
Builds the RAG vector database (services/rag/vector_db.py) from
seed_templates/templates.json and exposes top-k retrieval given a schema.
"""

from __future__ import annotations

import json
from pathlib import Path

from vector_db import VectorDB, DEFAULT_DB_PATH

TEMPLATES_PATH = Path(__file__).parent / "seed_templates" / "templates.json"


def build_index(db_path: str | Path = DEFAULT_DB_PATH, force_rebuild: bool = False) -> VectorDB:
    """
    Opens (or creates) the SQLite vector DB and seeds it from
    templates.json if empty. Safe to call on every request — only does
    real work the first time or when force_rebuild=True.
    """
    db = VectorDB(db_path)
    if force_rebuild:
        db.clear()
    # Upsert the reviewed catalog on startup. This keeps the persisted store
    # aligned with schema/template upgrades rather than silently querying an
    # old, underspecified catalog from a previous run.
    # Only rows that actually differ are written: this runs on every generate
    # request, and rewriting identical rows dirtied the tracked catalog file and
    # made concurrent jobs contend for SQLite's write lock.
    templates = json.loads(TEMPLATES_PATH.read_text())
    existing = {row[0]: (row[1], row[2]) for row in db.conn.execute("SELECT id, text, code FROM templates")}
    for t in templates:
        if existing.get(t["id"]) != (t["schema_pattern"], t["code"]):
            db.add(t["id"], t["schema_pattern"], t["code"])
    return db


def describe_schema_node(node: dict) -> str:
    """
    Turns a schema (sub)tree into a short natural-language description for
    embedding/retrieval, e.g. "container with button, button, text" — this
    is what gets matched against each template's schema_pattern text.
    """
    child_types = [c.get("role") or c["type"] for c in node.get("children", [])]
    layout = (node.get("layout") or {}).get("direction", "auto")
    role = node.get("role") or node["type"]
    repeated = " repeated" if (node.get("layout") or {}).get("repeated") else ""
    descendants = []
    def walk(current):
        for child in current.get("children", []):
            descendants.append(child.get("role") or child["type"])
            walk(child)
    walk(node)
    signature = " ".join(sorted(set(descendants)))
    text = f"{role} {layout}{repeated} with {', '.join(child_types)} structure {signature}" if child_types else f"{role} {layout} structure {signature}"
    return text.strip()


def _metadata_for(pattern_id: str) -> dict:
    if "card" in pattern_id: return {"patternType": "section", "pageCategory": "commerce", "layoutMode": "grid", "componentFamily": "card", "quality": 0.9}
    if "header" in pattern_id or "nav" in pattern_id: return {"patternType": "section", "pageCategory": "any", "layoutMode": "row", "componentFamily": "navigation", "quality": 0.95}
    if "form" in pattern_id: return {"patternType": "section", "pageCategory": "auth-or-form", "layoutMode": "column", "componentFamily": "form", "quality": 0.9}
    if "image" in pattern_id: return {"patternType": "component", "pageCategory": "commerce", "layoutMode": "block", "componentFamily": "media", "quality": 0.85}
    return {"patternType": "component", "pageCategory": "any", "layoutMode": "auto", "componentFamily": "ui", "quality": 0.8}


def retrieve_templates(schema_node: dict, db: VectorDB, k: int = 3) -> list[dict]:
    query = describe_schema_node(schema_node)
    results = db.search(query, k=k)
    # These are deliberate retrieval units: one known-good UI pattern with
    # its normalized description and reviewed JSX. They are not arbitrary
    # code chunks, which keeps context focused and debuggable.
    return [{
        "score": score,
        "id": payload["id"],
        "sourceType": "ui-pattern-template",
        "metadata": _metadata_for(payload["id"]),
        "description": payload["text"],
        "tags": sorted(set(query.split()) & set(payload["text"].split())),
        "code": payload["code"],
    } for score, payload in results if score >= 0.03]


def retrieve_layout_context(schema_tree: dict, db: VectorDB) -> list[dict]:
    """Multi-level retrieval: page skeleton plus every major section.
    De-duplicates references while retaining `retrievalLevel` for debug and
    prompt construction. This gives a product gallery different evidence
    from the page as a whole instead of one vague root match."""
    units = [("page", schema_tree)]
    def walk(node):
        if node.get("role") in {"header", "main", "gallery", "product-detail", "related-products", "footer"}:
            units.append(("section", node))
        for child in node.get("children", []): walk(child)
    walk(schema_tree)
    merged = {}
    for level, unit in units:
        for item in retrieve_templates(unit, db, k=2):
            key = item["id"]
            if key not in merged or item["score"] > merged[key]["score"]:
                merged[key] = {**item, "retrievalLevel": level, "query": describe_schema_node(unit)}
    return sorted(merged.values(), key=lambda item: item["score"], reverse=True)[:8]


if __name__ == "__main__":
    db = build_index(force_rebuild=True)
    print(f"Indexed {db.size()} templates -> {db.path}")
    db.close()
