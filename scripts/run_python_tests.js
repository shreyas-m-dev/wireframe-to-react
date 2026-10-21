'use strict';
// Runs every Python test file with the project interpreter and reports each
// file's real exit status. Exits non-zero if any file fails. No file is
// silently skipped: pass KNOWN_FAILING to see expected failures listed apart.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const python = process.env.PYTHON_BIN
  || [path.join(ROOT, '.venv/Scripts/python.exe'), path.join(ROOT, '.venv/bin/python')].find((p) => fs.existsSync(p))
  || 'python3';
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', 'fixtures']);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/^test_.*\.py$|\.test\.py$/.test(entry.name)) files.push(full);
  }
})(ROOT);

const env = { ...process.env, PYTHON_BIN: python, VISION_ENABLED: 'false', VISION_PROVIDER: 'disabled', GEN_MODE: 'template' };
let failed = 0;
for (const file of files.sort()) {
  // pytest-style files define test functions without a __main__ runner; run
  // them through pytest so they can't "pass" by executing nothing.
  const usesPytest = /^\s*import pytest|^\s*from pytest/m.test(fs.readFileSync(file, 'utf8'));
  const args = usesPytest ? ['-m', 'pytest', '-q', file] : [file];
  const result = spawnSync(python, args, { cwd: ROOT, env, encoding: 'utf8', timeout: 600_000 });
  const ok = result.status === 0;
  if (!ok) failed += 1;
  const last = `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n').pop() || '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${path.relative(ROOT, file)}  ${last.slice(0, 120)}`);
}
console.log(`\n${files.length - failed}/${files.length} Python test files passed (interpreter: ${python})`);
process.exit(failed ? 1 : 0);
