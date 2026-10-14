#!/usr/bin/env python3
"""Export persisted semantic metadata without dumping binary embeddings."""
from __future__ import annotations
import argparse,json
from pathlib import Path
from vector_store import CatalogStore
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--catalog",type=Path,default=Path(__file__).parent/'catalog.sqlite3');parser.add_argument("--output",type=Path,required=True);args=parser.parse_args();store=CatalogStore(args.catalog);rows=store.conn.execute("SELECT id,collection_name,text,image_path,schema_json,code,layout_signature_json,metadata_json,embedding_model,embedding_dimension,embedding_version FROM records ORDER BY id").fetchall();store.close();args.output.write_text("\n".join(json.dumps({"id":r[0],"collection":r[1],"text":r[2],"imagePath":r[3],"schema":json.loads(r[4]),"code":r[5],"layoutSignature":json.loads(r[6]),"metadata":json.loads(r[7]),"embeddingModel":r[8],"embeddingDimension":r[9],"embeddingVersion":r[10]}) for r in rows)+"\n",encoding='utf-8')
if __name__=='__main__':main()
