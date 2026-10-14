# Dataset readiness plan

Do not download or ingest data until its data card, licence, privacy terms, and sample quality are reviewed. Start with 20 manually reviewed examples, then 100; only consider 500 after the fixture/evaluation loop identifies a useful metric. Do not blindly ingest 31GB+ of mixed data: noise, duplicates, licence uncertainty, irrelevant mobile screens, and unreviewed generated code would degrade retrieval and regression quality.

## Data by purpose

| Purpose | Required data |
|---|---|
| Vision/layout model | Screenshot/wireframe image, dimensions, page/section/component boxes, hierarchy, component labels, optional OCR text. |
| RAG | Reviewed normalized page/section/component schema, concise structural description, verified React/HTML/CSS, provenance/licence/quality metadata. |
| Evaluation | Image, expected macro bounds and hierarchy/counts, expected screenshot or DOM assertions, error notes. |

Never store raw private uploads, OCR noise, raw image binaries, secrets, unlicensed source code, or millions of unreviewed fragments in `vectors.sqlite3`. The current three-column SQLite table is unsuitable for rich metadata. Future ingestion should consume versioned JSONL source and use an explicit catalog migration.

## Locations and future ingestion

```text
services/fixtures/uploads/       local, uncommitted approved test images
services/fixtures/expected/      expected evaluation JSON
services/fixtures/outputs/       generated reports
data/page_patterns.jsonl         future reviewed page-level RAG source
data/section_patterns.jsonl      future reviewed section RAG source
data/component_patterns.jsonl    future reviewed component RAG source
data/schema_examples.jsonl       future schema/code pairs
data/code_examples.jsonl         future reviewed implementation references
data/evaluation_cases.jsonl      future evaluation manifest
data/user_corrections.jsonl      future approved corrections
```

There is no ingestion command today. Do not use `build_index()` as one: it only upserts `seed_templates/templates.json` into the existing database. A future `scripts/ingest_catalog.py` should validate JSONL, deduplicate, record provenance/version/quality, migrate a new catalog schema, and build a reproducible index.

## JSONL contracts

Each collection requires the following fields. These are two valid records per collection.

`page_patterns.jsonl`

```json
{"id":"page-commerce-001","source_type":"reviewed","description":"product gallery left, detail right, related grid","schema_id":"schema-commerce-001","layout_mode":"two-column","page_category":"ecommerce","component_types":["header","gallery","product-detail","card-grid"],"tags":["commerce","gallery"],"quality_score":0.95,"version":"1"}
{"id":"page-auth-001","source_type":"reviewed","description":"centered login form","schema_id":"schema-auth-001","layout_mode":"column","page_category":"auth","component_types":["form","input","button"],"tags":["login"],"quality_score":0.95,"version":"1"}
```

`section_patterns.jsonl`

```json
{"id":"section-gallery-001","page_pattern_id":"page-commerce-001","section_type":"gallery","description":"large media with four thumbnails","layout_mode":"column","child_count":5,"geometry_signature":"0.48x0.62-left","quality_score":0.95,"version":"1"}
{"id":"section-header-001","page_pattern_id":"page-commerce-001","section_type":"header","description":"logo navigation search account action","layout_mode":"row","child_count":4,"geometry_signature":"1.0x0.08-top","quality_score":0.9,"version":"1"}
```

`component_patterns.jsonl`

```json
{"id":"component-primary-cta-001","component_family":"button","description":"primary product action","schema_fragment":{"type":"button","role":"primary-action"},"tags":["cta","commerce"],"quality_score":0.95,"version":"1"}
{"id":"component-card-001","component_family":"card","description":"product card media title price","schema_fragment":{"type":"card","layout":{"direction":"column"}},"tags":["card","commerce"],"quality_score":0.95,"version":"1"}
```

`schema_examples.jsonl`

```json
{"id":"schema-commerce-001","image_id":"commerce-001","schema":{"type":"page","children":[{"type":"header"},{"type":"main","layout":{"direction":"row"}}]},"quality_score":0.95,"version":"1"}
{"id":"schema-auth-001","image_id":"auth-001","schema":{"type":"page","children":[{"type":"form","layout":{"direction":"column"}}]},"quality_score":0.95,"version":"1"}
```

`code_examples.jsonl`

```json
{"id":"code-commerce-001","schema_id":"schema-commerce-001","language":"jsx","code_path":"reviewed/commerce-001.jsx","description":"verified product page React","quality_score":0.95,"licence":"reviewed","version":"1"}
{"id":"code-auth-001","schema_id":"schema-auth-001","language":"jsx","code_path":"reviewed/auth-001.jsx","description":"verified login React","quality_score":0.95,"licence":"reviewed","version":"1"}
```

`evaluation_cases.jsonl`

```json
{"id":"eval-commerce-001","image_path":"services/fixtures/uploads/commerce-001.png","expected_path":"services/fixtures/expected/commerce-001.json","required_roles":["header","gallery","product-detail"],"min_fidelity":0.8,"version":"1"}
{"id":"eval-auth-001","image_path":"services/fixtures/uploads/auth-001.png","expected_path":"services/fixtures/expected/auth-001.json","required_roles":["form"],"min_fidelity":0.8,"version":"1"}
```

`user_corrections.jsonl`

```json
{"id":"correction-001","image_id":"commerce-001","node_id":"container-8","correction":"role should be product-detail","approved_by":"local-review","version":"1"}
{"id":"correction-002","image_id":"auth-001","node_id":"input-3","correction":"type should be input","approved_by":"local-review","version":"1"}
```

## Candidate sources: manual review only

| Source | Likely coverage | Best initial use | Required review |
|---|---|---|---|
| [WebSight](https://huggingface.co/datasets/HuggingFaceM4/WebSight) | synthetic web screenshots/code | RAG and code-layout evaluation | data card/licence, synthetic bias |
| [Google Screen Annotation](https://github.com/google-research-datasets/screen_annotation) | screen/UI annotations, likely mixed/mobile | vision detection/evaluation | annotation format/licence |
| [Screen2Words](https://github.com/google-research-datasets/screen2words) | mobile UI summaries | evaluation/text descriptions | licence and mobile bias |
| [Rico](https://huggingface.co/datasets/shunk031/Rico) | mobile Android UI | mobile layout research/evaluation | licence/data-card and desktop mismatch |
| [Enrico](https://github.com/luileito/enrico) | mobile UI design/semantics | component/layout evaluation | licence/data format and domain fit |

None should be downloaded yet. None can replace a reviewed desktop-web wireframe set. For ecommerce desktop pages, use an approved sample with screenshot, layout tree, boxes, and verified code.
