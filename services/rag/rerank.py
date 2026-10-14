"""Structure-aware deterministic reranking; retrieval never changes detection."""
from __future__ import annotations
import numpy as np

def layout_score(query: dict, candidate: dict) -> float:
    q, c = query.get("layoutSignature", {}), candidate.get("layoutSignature", {})
    keys = ["pageCategory", "layoutMode", "mainColumnCount", "hasHeader", "hasFooter", "mediaRegionCount"]
    matches = sum(1 for key in keys if q.get(key) is not None and q.get(key) == c.get(key))
    q_groups, c_groups = q.get("repeatedGroups", []), c.get("repeatedGroups", [])
    group = 1 if q_groups and c_groups and q_groups[0].get("role") == c_groups[0].get("role") else 0
    return (matches + group) / (len(keys) + 1)

def rerank(query: dict, candidates: list[dict], query_vector: np.ndarray) -> list[dict]:
    ranked=[]
    for item in candidates:
        semantic=float(np.dot(query_vector, item["embedding"]))
        structural=layout_score(query,item)
        quality=float(item["metadata"].get("qualityScore", 0))
        ranked.append({**item,"semanticScore":semantic,"structuralScore":structural,"finalScore":.65*semantic+.25*structural+.10*quality})
    return sorted(ranked,key=lambda item:item["finalScore"],reverse=True)
