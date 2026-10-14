"""Persisted SQLite metadata + optional FAISS index for semantic catalog."""
from __future__ import annotations
import json
import sqlite3
from pathlib import Path
import numpy as np

DEFAULT_CATALOG_PATH = Path(__file__).parent / "catalog.sqlite3"


class CatalogStore:
    def __init__(self, path: Path = DEFAULT_CATALOG_PATH):
        self.path = Path(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.execute("""CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY, collection_name TEXT NOT NULL, text TEXT NOT NULL,
          image_path TEXT, schema_json TEXT, code TEXT, layout_signature_json TEXT NOT NULL,
          metadata_json TEXT NOT NULL, embedding BLOB NOT NULL, embedding_model TEXT NOT NULL,
          embedding_dimension INTEGER NOT NULL, embedding_version TEXT NOT NULL)""")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection_name)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_records_model ON records(embedding_model, embedding_dimension, embedding_version)")
        self.conn.commit()
    def upsert(self, record: dict, vector: np.ndarray, model: str, version: str = "1") -> None:
        vector = np.asarray(vector, dtype=np.float32)
        self.conn.execute("""INSERT OR REPLACE INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""", (
          record["id"], record["collection"], record["text"], record.get("imagePath"),
          json.dumps(record.get("schema") or {}), record.get("code"), json.dumps(record.get("layoutSignature") or {}),
          json.dumps(record.get("metadata") or {}), vector.tobytes(), model, vector.size, version))
        self.conn.commit()
    def candidates(self, collections: list[str], model: str, dimension: int, version: str = "1") -> list[dict]:
        marks = ",".join("?" for _ in collections)
        rows = self.conn.execute(f"SELECT * FROM records WHERE collection_name IN ({marks}) AND embedding_model=? AND embedding_dimension=? AND embedding_version=?", [*collections, model, dimension, version]).fetchall()
        keys = ["id","collection","text","imagePath","schema","code","layoutSignature","metadata","embedding","embeddingModel","embeddingDimension","embeddingVersion"]
        return [{**dict(zip(keys,row)), "embedding": np.frombuffer(row[8], dtype=np.float32), "schema":json.loads(row[4]), "layoutSignature":json.loads(row[6]), "metadata":json.loads(row[7])} for row in rows]
    def clear(self) -> None:
        """Clear only an explicitly selected semantic catalog, never vectors.sqlite3."""
        self.conn.execute("DELETE FROM records")
        self.conn.commit()
    def close(self): self.conn.close()
