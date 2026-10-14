# Prepared semantic RAG catalog

The legacy `vectors.sqlite3` remains the active 23-record compatibility catalog. It is not overwritten by this preparation. The new path uses `catalog.sqlite3` only after an explicit ingestion command and stores reviewed metadata plus persisted float32 embedding bytes, model id, dimension, and embedding version.

## Source records

JSONL sources live in `datasets/page_patterns`, `section_patterns`, `component_patterns`, `schema_examples`, `code_examples`, `evaluation_cases`, and `user_corrections`. They are synthetic/project-owned examples now; no public dataset was downloaded.

```powershell
# validate only; no database write
.\.venv\Scripts\python.exe services\rag\validate_dataset.py services\rag\datasets\page_patterns\synthetic.jsonl

# semantic embeddings, after optional package installation
.\.venv\Scripts\python.exe -m pip install -r requirements-rag.txt
.\.venv\Scripts\python.exe services\rag\ingest.py services\rag\datasets\page_patterns\synthetic.jsonl --catalog services\rag\catalog.sqlite3

# deliberate semantic-catalog rebuild; clears only the catalog named here
.\.venv\Scripts\python.exe services\rag\ingest.py services\rag\datasets\page_patterns\synthetic.jsonl --catalog services\rag\catalog.sqlite3 --rebuild

# deliberate one-way compatibility migration; reads vectors.sqlite3 with mode=ro
.\.venv\Scripts\python.exe services\rag\ingest.py --migrate-legacy --catalog services\rag\catalog.sqlite3
```

`RAG_EMBEDDING_PROVIDER=local` selects sentence-transformers and fails clearly until `requirements-rag.txt` is installed. `RAG_EMBEDDING_PROVIDER=hash` is deterministic bootstrap/test fallback only; it is not semantic retrieval. Never mix providers/models/dimensions: `CatalogStore.candidates()` filters by all three persisted properties.

`retrieval.py` defines page/section/component retrieval, approved React-only metadata filtering, and semantic+structural+quality reranking. It is prepared infrastructure and is deliberately not wired into default generation until it has fixture evidence.
