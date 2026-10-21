'use strict';
// Runs CGDA + validation over every stored pipeline output so changes to the
// filter or the tag map are checked against real compiler output, not only
// hand-written snippets.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runCgda, parseJsx } = require('./cgda');
const { diffTrees } = require('../validation/validate');

const OUTPUTS = path.join(__dirname, '../fixtures/outputs');
// Known, reviewed findings in historical fixture output. Anything not listed
// here must come through CGDA untouched and validate at 100%.
// (media_1788446362666's contact-form <input> used to be listed here; it is the
// email field the compiler synthesises for every contact-section, now allowed.)
const EXPECTED_STRIPPED = {};
const EXPECTED_VIOLATIONS = { 'landing-final-generalized': ['submit-outside-form'] };

let checked = 0;
for (const name of fs.readdirSync(OUTPUTS)) {
  const dir = path.join(OUTPUTS, name);
  const codeFile = ['generated-before-cgda.jsx', 'generated.jsx'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  const schemaFile = ['codegen-schema.json', 'schema.json'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!codeFile || !schemaFile) continue;
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  const result = runCgda(fs.readFileSync(codeFile, 'utf8'), schema);
  assert.deepStrictEqual(result.report.stripped.map((s) => [s.tag, s.reason]), EXPECTED_STRIPPED[name] || [], `${name}: unexpected CGDA stripping`);
  assert.deepStrictEqual(result.structuralViolations.map((v) => v.type), EXPECTED_VIOLATIONS[name] || [], `${name}: unexpected structural violations`);
  const diff = diffTrees(schema, parseJsx(result.cleanedJsx));
  assert.strictEqual(diff.structuralAccuracy, 1, `${name}: structural accuracy ${diff.structuralAccuracy}`);
  assert.deepStrictEqual(diff.extraInCode, [], `${name}: unaccounted elements`);
  checked += 1;
}
assert.ok(checked >= 30, `expected to check at least 30 fixtures, checked ${checked}`);
console.log(`PASS CGDA + validation over ${checked} stored fixture outputs`);
