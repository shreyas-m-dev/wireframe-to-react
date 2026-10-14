#!/usr/bin/env python3
"""Explicit semantic-catalog ingestion. Never writes vectors.sqlite3."""
from __future__ import annotations
import argparse,json,sqlite3
from pathlib import Path
from embedding_provider import get_embedding_provider
from vector_store import CatalogStore
from validate_dataset import validate_file,validate_record

ROOT=Path(__file__).parent
def records(paths):
    for path in paths:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if line.strip(): yield json.loads(line)
def main():
    parser=argparse.ArgumentParser(); parser.add_argument("paths",nargs="*"); parser.add_argument("--catalog",type=Path,default=ROOT/"catalog.sqlite3"); parser.add_argument("--migrate-legacy",action="store_true"); parser.add_argument("--provider",default=None); parser.add_argument("--rebuild",action="store_true",help="clear only the selected semantic catalog before ingesting"); args=parser.parse_args()
    inputs=[Path(p) for p in args.paths]
    if args.migrate_legacy:
        legacy=sqlite3.connect(f"file:{(ROOT/'vectors.sqlite3').resolve().as_posix()}?mode=ro",uri=True)
        migration=ROOT/"datasets"/"legacy_templates.jsonl"; migration.parent.mkdir(exist_ok=True)
        rows=legacy.execute("SELECT id,text,code FROM templates ORDER BY id").fetchall(); legacy.close()
        migration.write_text("\n".join(json.dumps({"id":f"legacy-{i}","collection":"component_patterns","text":text,"imagePath":None,"schema":{},"code":code,"layoutSignature":{"pageCategory":"other","hasHeader":False,"hasFooter":False,"majorSectionCount":1,"layoutMode":"mixed","mainColumnCount":1,"majorColumnRatios":[],"mediaRegionCount":0,"textGroupCount":0,"controlCount":0,"repeatedGroups":[]},"metadata":{"pageCategory":"other","patternType":"legacy-template","sectionCategory":None,"componentFamily":None,"tags":["legacy"],"sourceKind":"reviewed-internal-example","sourceProvenance":"vectors.sqlite3 migration","license":"project-internal","qualityScore":0.5,"reviewStatus":"approved","version":"legacy-1","frontendStack":"React"}}) for i,text,code in rows)+"\n",encoding="utf-8")
        inputs.append(migration)
    if not inputs: parser.error("provide JSONL paths or --migrate-legacy")
    for path in inputs:
        errors=validate_file(path)
        if errors: raise SystemExit("\n".join(errors))
    provider=get_embedding_provider(args.provider); store=CatalogStore(args.catalog)
    if args.rebuild: store.clear()
    count=0
    for record in records(inputs): store.upsert(record,provider.embed([record["text"]])[0],provider.model_id); count+=1
    store.close(); print(json.dumps({"ingested":count,"catalog":str(args.catalog),"model":provider.model_id,"dimension":provider.dimension}))
if __name__=="__main__": main()
