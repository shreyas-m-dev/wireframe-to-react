"""Three-level semantic retrieval over explicitly ingested reviewed records."""
from __future__ import annotations
import os
from embedding_provider import get_embedding_provider
from vector_store import CatalogStore
from rerank import rerank

LEVELS={"page":["page_patterns","schema_examples"],"section":["section_patterns"],"component":["component_patterns","code_examples"]}

def make_query(schema: dict) -> dict:
    plan=schema.get("layoutPlan",{}); zones=plan.get("majorZones",[])
    roles=[zone.get("role") for zone in zones]
    return {"text":f"{plan.get('pageCategory','other')} {' '.join(roles)}", "layoutSignature":{"pageCategory":plan.get("pageCategory","other"),"hasHeader":"header" in roles,"hasFooter":"footer" in roles,"majorSectionCount":len(zones),"layoutMode":schema.get("layout",{}).get("direction","mixed"),"mainColumnCount":2 if "gallery" in roles and "product-detail" in roles else 1,"mediaRegionCount":roles.count("gallery"),"repeatedGroups":[]}}

def retrieve(schema: dict, level: str, store: CatalogStore | None = None) -> dict:
    provider=get_embedding_provider(); store=store or CatalogStore(); query=make_query(schema); vector=provider.embed([query["text"]])[0]
    candidates=store.candidates(LEVELS[level],provider.model_id,provider.dimension)
    allowed=[c for c in candidates if c["metadata"].get("reviewStatus")=="approved" and c["metadata"].get("frontendStack")=="React" and c["metadata"].get("qualityScore",0)>=.7]
    minimum=float(os.getenv("RAG_MIN_SCORE","0.35")); ranked=[r for r in rerank(query,allowed,vector) if r["finalScore"]>=minimum]
    return {"level":level,"query":query,"filters":{"reviewStatus":"approved","frontendStack":"React","qualityScoreGte":.7,"minScore":minimum},"results":[{k:v for k,v in item.items() if k not in {"embedding"}} for item in ranked]}
