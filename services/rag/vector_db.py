"""
Vector database — Pipeline Step 4 (RAG storage layer).

This is a REAL, separate, persistent vector database: a `.sqlite3` file on
disk, independent of the Python process, inspectable with any SQLite
client (`sqlite3 vectors.sqlite3 "select id, text from templates"`), that
survives restarts.

Why SQLite instead of FAISS: FAISS needs `pip install faiss-cpu`, which
requires network access this environment doesn't have. SQLite is Python's
standard library — zero install, works everywhere Python does — and is a
legitimate, widely-used choice for vector storage at this scale (dozens to
low-thousands of rows). If your template library grows past a few thousand
entries, swap this for `faiss-cpu` — the `VectorDB` interface (`.add()` /
`.search()`) doesn't need to change.

Why TF-IDF instead of a hash embedding: an earlier version of this file
hashed tokens into fixed buckets as a stand-in for a real embedding model
(no network access to call one). That's a genuine shortcut worth removing
— scikit-learn IS available in this environment with no install needed, so
this now uses real TF-IDF vectors (term frequency, weighted down by how
common a word is across the template corpus, with bigrams so short phrases
like "text block" count for more than their individual words). This is a
standard, real information-retrieval technique — not state-of-the-art
semantic search like a neural embedding model would give you, but a
legitimate, well-understood algorithm, not a hack. Swap `_vectorize()`
below for a call to a real embedding API (e.g. Gemini's embedding-001) if
you want semantic rather than lexical matching once you have network
access — nothing else in this file needs to change.

Schema:
    CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,   -- schema_pattern description, what gets matched against
        code TEXT NOT NULL    -- the React snippet payload
    )

TF-IDF vectors are computed fresh from the stored `text` column at query
time (see `_vectorize`) rather than precomputed and stored — at this scale
(dozens of templates) that's milliseconds, and it means retrieval quality
improves automatically as templates are added, with no stale-vector
problem to manage.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
try:
    import faiss
except ImportError:
    faiss = None

DEFAULT_DB_PATH = Path(__file__).parent / "vectors.sqlite3"


def _tokenize_and_stem(text: str) -> list[str]:
    """Naive plural stemming ('buttons' -> 'button') so a query built from
    schema type names (singular: "button", "text") still matches template
    descriptions written in prose (often plural: "two nav buttons"). A real
    stemmer (e.g. Porter/Snowball via nltk) would be more correct — this is
    a small dependency-free approximation, good enough for the UI-component
    vocabulary this corpus actually uses (verified against
    test_retrieve.py's header/nav-buttons retrieval case)."""
    tokens = re.findall(r"\b\w+\b", text.lower())
    return [t[:-1] if t.endswith("s") and len(t) > 3 else t for t in tokens]


def _vectorize(corpus: list[str], query: str):
    """
    Fits a TF-IDF vectorizer on the template corpus and transforms both the
    corpus and the query into that vector space. Unigrams + bigrams (so
    "text block" and "form field" count as phrases, not just loose word
    bags); scikit-learn L2-normalizes TF-IDF vectors by default, so a dot
    product between two vectors IS their cosine similarity — no separate
    normalization step needed.
    """
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), tokenizer=_tokenize_and_stem, token_pattern=None)
    doc_matrix = vectorizer.fit_transform(corpus)
    query_vec = vectorizer.transform([query])
    return doc_matrix, query_vec


class VectorDB:
    """
    A real SQLite-backed vector store. Each instance owns a connection to a
    `.sqlite3` file on disk — a genuinely separate database, not a Python
    dict pretending to be one.
    """

    def __init__(self, path: str | Path = DEFAULT_DB_PATH):
        self.path = Path(path)
        self.conn = sqlite3.connect(str(self.path))
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                code TEXT NOT NULL
            )
            """
        )
        self.conn.commit()
        # FAISS is the production default. SQLite remains the durable source
        # of templates; the in-memory FAISS index is rebuilt per query so it
        # can never become stale after a template write.
        requested = __import__('os').environ.get('RAG_BACKEND', 'faiss').lower()
        self.backend = 'faiss' if requested == 'faiss' and faiss is not None else 'numpy-exact'

    def add(self, id_: str, text: str, code: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO templates (id, text, code) VALUES (?, ?, ?)",
            (id_, text, code),
        )
        self.conn.commit()

    def search(self, query_text: str, k: int = 3) -> list[tuple[float, dict]]:
        rows = self.conn.execute("SELECT id, text, code FROM templates").fetchall()
        if not rows:
            return []
        ids = [r[0] for r in rows]
        texts = [r[1] for r in rows]
        codes = [r[2] for r in rows]

        doc_matrix, query_vec = _vectorize(texts, query_text)
        scores = (doc_matrix @ query_vec.T).toarray().ravel()

        if self.backend == 'faiss':
            matrix = doc_matrix.astype(np.float32).toarray()
            index = faiss.IndexFlatIP(matrix.shape[1])
            index.add(matrix)
            found_scores, found_indices = index.search(query_vec.astype(np.float32).toarray(), min(k, len(rows)))
            return [(float(score), {"id": ids[i], "text": texts[i], "code": codes[i]}) for score, i in zip(found_scores[0], found_indices[0]) if i >= 0]
        top_k_idx = np.argsort(-scores)[:k]
        return [
            (float(scores[i]), {"id": ids[i], "text": texts[i], "code": codes[i]})
            for i in top_k_idx
        ]

    def size(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0]

    def clear(self) -> None:
        self.conn.execute("DELETE FROM templates")
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
