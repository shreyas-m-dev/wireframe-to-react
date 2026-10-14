# Landing schema construction forensics

## Evidence examined

The available fresh local artifact is `services/fixtures/outputs/landing-final2/`. Its `vision-merge.json` says `used: false`; it does not contain `vision-status.json`, `vision-schema.json`, or `vision-response-summary.json`. The supplied `paste-5.txt` is not present in the workspace. Therefore this report does not infer a real Gemini merge from the status endpoint.

`landing-final2/canonical-schema.json` showed `container-5` (`media-region`), `region-25` (`hero-section`), `region-26` (`services-section`), `container-8` (`repeated-region`), and `region-28` (`contact-section`) with `source.cv=true`, `source.vision=false`, and macro-layout-pass evidence.

## Root cause

1. `canonical_reconciliation.py` flattened adapter nodes into generic detection elements but kept vision provenance only in a transport-level `sources` list.
2. `schema.js::makeNode` only looked at `element.visionEvidence`, so those elements became CV-only nodes.
3. `schema.js::buildSchema` then rebuilt containment using all CV macro rectangles. The oversized `container-5` crossed hero and services bands and captured unrelated children.
4. The schema-to-code validator only checked identifiers, so a copied but semantically wrong tree appeared structurally complete.

The named nodes were all created in `buildSchema`: `makeNode` creates the ID-bearing node, while the former macro-layout containment pass attached it. They were not emitted by code generation.

## Repair and final canonical tree

The reconciler now carries an explicit `visionEvidence` payload for each adapter node. `makeNode` consumes both this payload and the `sources` list. A schema provenance assertion prevents `vision-merged` if no major canonical node has vision provenance.

For evidence that indicates a landing, `canonicalizeLanding` rebuilds macro parentage from top/header bands, headings, section geometry, reading order, and roles. It demotes an oversized CV media rectangle that overlaps independent macro bands. It also records every parent change in `layoutPlan.canonicalRepair`.

The fresh local result (`landing-final3-local2`) is:

```text
page
├── header
│   ├── logo
│   ├── nav-group (ABOUT, SERVICES, CONTACT)
│   └── CONTACT action
└── main
    ├── hero-section (HEADLINE, OCR copy, GET STARTED)
    ├── services-section (OUR SERVICES)
    ├── about-section (ABOUT US)
    └── contact-section (CONTACT US, SEND)
```

The local detector did not yield an input field or three trustworthy same-size card boxes in this run; the repair deliberately does not invent a form wrapper or three cards. Thumbnail fragments were dropped as unsupported local ecommerce evidence for a landing page. The output remains `needs-review`.

## Merge answers

- Gemini nodes enter merge only when `vision_schema` is present; in the inspected artifact they did not.
- Adapter output now enters the merge with explicit `visionEvidence`.
- Merge output is the direct `buildSchema` input.
- The old macro containment pass was the later overwrite mechanism; it is superseded for landing evidence by the canonical macro reconstruction.
- `source.vision=false` previously persisted because the schema builder ignored `sources`; that contract is fixed.
- Placeholder labels originated in deterministic codegen when a schema node had no OCR/vision text. Empty heading nodes are now validation defects rather than accepted output.

## Provenance and visual status

The attempted `landing-final3-vision` fixture run still wrote `used:false` and has zero canonical vision nodes, so its true source is `local-cv-ocr-fallback`; it is not a Gemini proof. No browser source-versus-rendered comparison ran. `sourceVsRenderedScore` remains null and `overallStatus` remains `needs-review`.
