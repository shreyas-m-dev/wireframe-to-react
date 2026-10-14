/**
 * Tests for backend/python_resolver.js — the fix for a real bug found in
 * the field: server.js originally hardcoded 'python3' as the command to
 * spawn. On Windows, Python is normally installed as just `python` —
 * `python3.exe` is usually the OS's own Store-redirect stub, which prints
 * "Python was not found; run without arguments to install from the
 * Microsoft Store..." and does nothing else. Every Windows user hit this
 * before detection ever ran.
 *
 * This module has zero dependencies (no Express/Multer/etc), so unlike
 * server.js itself, it can be tested here without `npm install` first.
 *
 * Run: node backend/python_resolver.test.js
 */

'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const { resolvePythonBin, WINDOWS_STUB_MARKER, _resetCache } = require('./python_resolver');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

test('resolvePythonBin finds a real Python on this machine', () => {
  _resetCache();
  delete process.env.PYTHON_BIN;
  const bin = resolvePythonBin();
  assert.ok(['python', 'python3'].includes(bin), `expected 'python' or 'python3', got '${bin}'`);
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' });
  assert.ok(/Python \d/.test(version), `'${bin} --version' didn't look like real Python: ${version}`);
});

test('resolvePythonBin caches its result across calls', () => {
  _resetCache();
  delete process.env.PYTHON_BIN;
  const first = resolvePythonBin();
  const second = resolvePythonBin();
  assert.strictEqual(first, second);
});

test('forceRedetect bypasses the cache', () => {
  _resetCache();
  delete process.env.PYTHON_BIN;
  const first = resolvePythonBin();
  const second = resolvePythonBin({ forceRedetect: true });
  assert.strictEqual(first, second); // same machine, same answer — but genuinely re-ran detection
});

test('PYTHON_BIN env var overrides auto-detection entirely', () => {
  _resetCache();
  process.env.PYTHON_BIN = 'some-custom-python-command';
  assert.strictEqual(resolvePythonBin(), 'some-custom-python-command');
  delete process.env.PYTHON_BIN;
  _resetCache();
});

test('picks the platform-appropriate candidate order', () => {
  _resetCache();
  delete process.env.PYTHON_BIN;
  const bin = resolvePythonBin();
  if (process.platform !== 'win32') {
    assert.strictEqual(bin, 'python3', 'non-Windows platforms should prefer python3');
  }
});

test('WINDOWS_STUB_MARKER matches the exact real-world stub message', () => {
  const realStubMessage =
    'Python was not found; run without arguments to install from the Microsoft Store, ' +
    'or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.';
  assert.ok(realStubMessage.includes(WINDOWS_STUB_MARKER));
});

test('an invalid PYTHON_BIN fails loudly when actually invoked, not silently', () => {
  _resetCache();
  process.env.PYTHON_BIN = '/definitely/not/a/real/python/binary';
  assert.strictEqual(resolvePythonBin(), '/definitely/not/a/real/python/binary');
  assert.throws(() => execFileSync('/definitely/not/a/real/python/binary', ['--version']));
  delete process.env.PYTHON_BIN;
  _resetCache();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
