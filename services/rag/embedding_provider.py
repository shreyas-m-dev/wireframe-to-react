"""Pluggable embeddings for the prepared semantic catalog.

No model is downloaded at import time. `sentence_transformers` is optional;
install requirements-rag.txt and run explicit ingestion before use.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import os
import re
from typing import Protocol
import numpy as np


class EmbeddingProvider(Protocol):
    model_id: str
    dimension: int
    def embed(self, texts: list[str]) -> np.ndarray: ...


@dataclass
class HashEmbeddingProvider:
    """Deterministic local fallback for tests/bootstrap, not semantic ML."""
    model_id: str = "project/hash-token-v1"
    dimension: int = 384
    def embed(self, texts: list[str]) -> np.ndarray:
        result = np.zeros((len(texts), self.dimension), dtype=np.float32)
        for row, text in enumerate(texts):
            for token in re.findall(r"\w+", text.lower()):
                slot = int(hashlib.sha256(token.encode()).hexdigest(), 16) % self.dimension
                result[row, slot] += 1
        norms = np.linalg.norm(result, axis=1, keepdims=True)
        return result / np.maximum(norms, 1e-12)


class SentenceTransformerProvider:
    def __init__(self, model_id: str):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError("Semantic local embeddings require: pip install -r requirements-rag.txt") from exc
        self.model_id = model_id
        self._model = SentenceTransformer(model_id)
        self.dimension = int(self._model.get_sentence_embedding_dimension())
    def embed(self, texts: list[str]) -> np.ndarray:
        return np.asarray(self._model.encode(texts, normalize_embeddings=True), dtype=np.float32)


def get_embedding_provider(name: str | None = None, model: str | None = None) -> EmbeddingProvider:
    name = (name or os.getenv("RAG_EMBEDDING_PROVIDER", "local")).lower()
    model = model or os.getenv("RAG_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    # local means semantic when the optional provider is installed; callers
    # can explicitly use hash only for tests/bootstrap, never by accident.
    if name in {"local", "sentence_transformers"}:
        return SentenceTransformerProvider(model)
    if name == "hash":
        return HashEmbeddingProvider()
    raise ValueError(f"Unsupported RAG_EMBEDDING_PROVIDER={name}")
