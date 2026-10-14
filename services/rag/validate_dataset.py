#!/usr/bin/env python3
"""Validate future catalog JSONL without touching any database."""
from __future__ import annotations
import json
from pathlib import Path

COLLECTIONS={"page_patterns","section_patterns","component_patterns","schema_examples","code_examples","evaluation_cases","user_corrections"}
REQUIRED={"id","collection","text","layoutSignature","metadata"}
def validate_record(record: dict) -> list[str]:
    errors=[]
    if not REQUIRED <= set(record): errors.append(f"missing {sorted(REQUIRED-set(record))}")
    if record.get("collection") not in COLLECTIONS: errors.append("invalid collection")
    meta=record.get("metadata",{})
    for key in ["sourceKind","sourceProvenance","license","qualityScore","reviewStatus","version","frontendStack"]:
        if key not in meta: errors.append(f"metadata.{key} missing")
    return errors
def validate_file(path: Path) -> list[str]:
    errors=[]
    for line_no,line in enumerate(path.read_text(encoding="utf-8").splitlines(),1):
        if not line.strip(): continue
        try: record=json.loads(line)
        except json.JSONDecodeError as exc: errors.append(f"{path}:{line_no}: {exc}"); continue
        for error in validate_record(record): errors.append(f"{path}:{line_no}: {error}")
    return errors
if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument("paths",type=Path,nargs="+"); args=parser.parse_args()
    errors=[error for path in args.paths for error in validate_file(path)]
    print("valid" if not errors else "\n".join(errors))
    raise SystemExit(bool(errors))
