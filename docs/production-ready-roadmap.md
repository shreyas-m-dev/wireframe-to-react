# Production-ready roadmap

Completed: local preprocessing/CV/OCR fallback, strict schema-only optional
vision adapters, conservative merge, normalized schema provenance fields,
schema-constrained compilation, CGDA, validation, and a shared final preview
artifact.

Before claiming broad visual fidelity: evaluate a configured provider against
held-out images, add a real browser screenshot comparison, then improve the
detector from measured failure clusters. Curated data, reviewed RAG examples,
and a trained detector remain future work. They are not part of this pass and
the existing vector database was not changed.
