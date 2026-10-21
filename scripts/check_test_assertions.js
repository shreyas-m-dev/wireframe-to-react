'use strict';
// CI gate: every test file must contain at least one real assertion.
// Guards against "tests" that only print PASS or copy their own source.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.venv', 'dist', 'data', '__pycache__']);
const IS_TEST = /(\.test\.(js|mjs|cjs|py)|^test_.*\.py|\.e2e\.test\.js)$/;
const ASSERTION = /\bassert\b|\bassert\.|expect\(|throw new Error\(|pytest\.raises|self\.assert/;

const offenders = [];
let count = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (IS_TEST.test(entry.name)) {
      count += 1;
      if (!ASSERTION.test(fs.readFileSync(full, 'utf8'))) offenders.push(path.relative(ROOT, full));
    }
  }
})(ROOT);

if (offenders.length) {
  console.error(`Test files without any assertion:\n  ${offenders.join('\n  ')}`);
  process.exit(1);
}
console.log(`PASS assertion gate: ${count} test files all contain assertions`);
