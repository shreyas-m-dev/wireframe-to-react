# Final3 reconstruction report

## Changes

- Preserved Gemini adapter provenance through reconciliation and into canonical schema nodes.
- Added a provenance assertion and canonical/code generation SHA-256 linkage in the backend.
- Rebuilt landing macro parentage from evidence, with a full reparenting audit under `layoutPlan.canonicalRepair`.
- Demoted multi-band media boxes, removed duplicate logo candidates, detached unsupported local thumbnail fragments, and kept CTA versus navigation contact nodes distinct.
- Expanded fidelity validation with macro duplicates, empty headings, unsupported labels, logo-in-nav, loose hero leaves, and loose contact controls.

## Landing result

`landing-final3-local2` has one header, one nav group, a direct logo, and one hero/services/about/contact sequence. It correctly fails readiness because the local evidence does not establish all requested form/card structures and no screenshot comparison exists.

`landing-final3-vision` fell back locally (`vision-merge.used=false`), despite the provider being available through the backend in prior runtime tests. Its artifact therefore is not claimed as a vision-merged result.

## Verification

```powershell
node services\schema\schema.test.js
node services\schema\product_layout.test.js
node services\validation\fidelity.test.js
.venv\Scripts\python.exe -m py_compile services\vision\canonical_reconciliation.py services\vision\merge_with_cv.py
.venv\Scripts\python.exe services\vision\test_canonical_reconciliation.py
node --check backend\server.js
```

The tests listed above pass. No datasets, API keys, RAG records, or `vectors.sqlite3` were changed.

## Remaining limitations

The fixture runner does not load the backend's root environment the same way as the live service, so this particular direct runner call used fallback evidence. A live `/api/detect` job is required to prove a Gemini-merged canonical tree after this repair. No visual score is fabricated; browser comparison remains pending.
