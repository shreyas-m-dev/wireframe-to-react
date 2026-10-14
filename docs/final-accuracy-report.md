# Final accuracy report

For supported clean wireframes the application produces a complete
schema-derived React page from recovered structure, with OCR labels where they
are readable. Local-only runs use CV/OCR; no vision provider was configured or
used in this repository pass. The final preview and Code tab consume the same
validated artifact.

The active ecommerce and landing fixture reports remain `Needs review` where
their observed source regions are absent from the recovered schema. No
unmeasured percentage or visual-similarity score is claimed. A configured
provider can enrich macro layout through the schema-only adapter, but provider
output must validate and cannot bypass CV/OCR, CGDA, or validation.

No datasets were downloaded, no RAG records were ingested, and
`services/rag/vectors.sqlite3` was not modified.
