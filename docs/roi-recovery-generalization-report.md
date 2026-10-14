# ROI recovery generalization report

The reusable recovery pass runs local edge/contour analysis inside detected
macro regions, maps boxes back to source coordinates, suppresses global/ROI
duplicates, then groups compatible boxes as horizontal, vertical, or grid
repeated regions. It does not use fixture filenames, coordinates, or fixed
item counts.

| Fixture | Category | Input | Detections | Local recovery | Repeated groups | Status |
|---|---|---|---:|---|---|---|
| ecommerce | product detail | real wireframe | 34 | three thumbnail candidates | thumbnail strip: 3; cards unresolved | needs-review |
| card-grid | generic grid | synthetic | 8 | generic ROI diagnostics | no confident semantic group | needs-review |
| login-form | form | synthetic | 7 | generic ROI diagnostics | no confident semantic group | needs-review |
| dashboard | dashboard | synthetic | 7 | generic ROI diagnostics | no confident semantic group | needs-review |
| landing | landing | synthetic | 11 | generic ROI diagnostics | repeated card grid: 3 | needs-review |

For ecommerce, `thumbnail-recovery.json` records three geometry-supported
items with a horizontal alignment and average 5.3px gap. `card-recovery.json`
is present and records no accepted card group rather than silently claiming
coverage. `repeatedGroupCoverage` remains zero and source structure remains
incomplete. A photographed glare/perspective fixture is unavailable locally,
so no result is claimed.

Metrics use schema-to-code coverage separately from recovery coverage:
`schemaToCodeCoverage` can be 1 while `sourceStructureCoverage` remains below
1. `sourceVsRenderedScore` is null because no rendered screenshot comparison
exists.
