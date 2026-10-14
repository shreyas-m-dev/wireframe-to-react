# RAG and vector database audit

## Read-only database result

Executed successfully:

```powershell
python scripts/inspect_rag_db.py
python scripts/inspect_rag_db.py --json
```

The script uses SQLite URI `mode=ro`; it never imports `retrieve.py` and cannot seed, update, or overwrite the database.

| Item | Actual result |
|---|---|
| Database | `services/rag/vectors.sqlite3` |
| Tables | one: `templates` |
| Schema | `id TEXT PRIMARY KEY`, `text TEXT NOT NULL`, `code TEXT NOT NULL` |
| Indexes | `sqlite_autoindex_templates_1` implicit primary-key index only |
| Records | 23 |
| Stored embedding arrays | no |
| Stored metadata/tags/provenance/score | no |

Ten sanitized sample ids observed: `button-with-icon`, `card-grid`, `card-image-title-text`, `checkbox-with-label`, `dropdown-select`, `footer-links-row`, `form-input-with-label`, `form-vertical-stack`, `header-logo-nav-buttons`, `icon-only`. Each has a human-readable pattern description in `text` and a reviewed JSX snippet in `code`.

## Exact implementation

`services/rag/vector_db.py`:

- `VectorDB.__init__()` opens SQLite and creates `templates` if missing.
- `VectorDB.add()` performs `INSERT OR REPLACE`.
- `VectorDB.search()` loads every row, calls `_vectorize()`, then ranks by TF-IDF cosine/inner product.
- `_vectorize()` creates a new `sklearn.feature_extraction.text.TfidfVectorizer` per query using unigrams+bigrams and `_tokenize_and_stem()`.
- No embedding model, model identifier, fixed dimension, index file, or stored vectors exists. Dimension equals the vocabulary size of the catalog at that query and is rebuilt each search.

FAISS is optional, not proven active. If `RAG_BACKEND=faiss` and Python can import `faiss`, `VectorDB.search()` creates an in-memory `faiss.IndexFlatIP` for the freshly built TF-IDF matrix, searches it, then discards it. It has no index file and no persistent vector count/dimension beyond the live query matrix. Otherwise `numpy.argsort` ranks the same TF-IDF dot-product scores. This is lexical sparse-vector retrieval, not neural semantic embeddings.

`requirements.txt` declares `faiss-cpu`; `.env.example` requests `RAG_BACKEND=faiss`. The active local Python failed to import NumPy/OpenCV during earlier verification, so neither FAISS import nor exact live retrieval ranking could be proven in this audit.

## End-to-end RAG flow

```text
seed_templates/templates.json
  -> build_index() [currently upserts every seed record into SQLite]
  -> retrieve_layout_context(schema, db)
       -> describe_schema_node(): role/layout/children/descendant signature text
       -> VectorDB.search(): runtime TF-IDF + optional transient FAISS
       -> retrieve_templates(): score >= 0.03; synthetic metadata/tags added in memory
  -> scripts/cli_pipeline.py: cmd_generate()
  -> template_compiler.compile_schema(schema, templates, overrides)
     OR generate.generate_code(schema, templates) -> build_prompt()
```

`retrieve_layout_context()` retrieves page plus `header`, `main`, `gallery`, `product-detail`, `related-products`, and `footer` subtrees, de-duplicates ids and keeps up to eight records. The exact call that reaches deterministic generation is `cmd_generate()` in `scripts/cli_pipeline.py` passing `templates` into `compile_schema()`. In the default compiler, the retrieved top result influences `_pick_root_style()` only; macro role geometry overrides generic style. In `GEN_MODE=llm`, `generate.build_prompt()` injects every retrieved record's id, score and `code` snippet into the prompt.

## Query, filtering, and requested categories

The query is text, for example: `product-detail column with ... structure gallery media ...`; it is not image-derived embedding data. Filtering is only `score >= 0.03`, then id de-duplication and max-eight truncation. There is no metadata filter, neural reranker, persisted quality score, or learned reranker. In-memory `_metadata_for()` infers labels from an id string; it is not stored in SQLite.

Exact live top-k results for ecommerce, dashboard, login and card-grid could not be generated because the configured Python lacks NumPy/scikit-learn. Static catalog inspection supports these expected candidates: ecommerce -> the three product records plus cards; login -> `form-vertical-stack`/`form-input-with-label`; card grid -> `card-grid`; dashboard has no dedicated dashboard record. Treat those as expectations, not measured rankings, until dependencies are installed and the read-only probe is run.

## Assessment

RAG is active in real generation requests, but the default deterministic compiler uses it weakly. The 23-record catalog can offer a small layout hint; it cannot train or improve image detection, cannot persist learned examples, and lacks enough curated page/section variants to materially generalize. A vector catalog cannot train YOLO/OpenCV; vision improvement requires labelled images/bounding boxes/layout trees and a model/training/evaluation path.
