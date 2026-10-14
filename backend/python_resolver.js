/**
 * Cross-platform Python executable detection. Extracted from server.js
 * into its own zero-dependency module (no Express) specifically so it can
 * be unit-tested without needing `npm install` first — see
 * python_resolver.test.js.
 *
 * Real bug this fixes: server.js originally hardcoded 'python3' as the
 * command to spawn. On Windows, Python is normally installed as just
 * `python` — `python3.exe` is usually the OS's own Store-redirect stub,
 * which prints "Python was not found; run without arguments to install
 * from the Microsoft Store..." and does nothing else. Every Windows user
 * hit this before detection ever ran. Auto-detecting the right command
 * (and specifically recognizing that stub message) fixes it without
 * requiring any manual configuration on most machines.
 */

'use strict';

const { execFileSync } = require('child_process');

// The exact message Windows' python.exe/python3.exe App Execution Alias
// stub prints. Not a crash — it's Windows redirecting to the Store — so
// it needs to be recognized explicitly rather than just treated as "this
// candidate doesn't exist" (its exit code/behavior isn't a plain ENOENT).
const WINDOWS_STUB_MARKER = 'Python was not found; run without arguments to install';

let resolvedPythonBin = null;

/**
 * Picks the right Python executable name for this machine, once, and
 * caches it. Tries the platform's likely name first (`python` on
 * Windows, `python3` elsewhere), falls back to the other name, and lets
 * PYTHON_BIN override both if your setup is unusual (a venv, a specific
 * path, etc).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.forceRedetect] - ignore the cache (used by tests)
 * @returns {string} the working Python command
 * @throws if no working, non-stub Python could be found
 */
function resolvePythonBin(opts = {}) {
  if (resolvedPythonBin && !opts.forceRedetect) return resolvedPythonBin;

  if (process.env.PYTHON_BIN) {
    resolvedPythonBin = process.env.PYTHON_BIN;
    return resolvedPythonBin;
  }

  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const candidate of candidates) {
    try {
      const out = execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (!out.includes(WINDOWS_STUB_MARKER)) {
        resolvedPythonBin = candidate;
        return resolvedPythonBin;
      }
    } catch {
      // candidate not found, or the stub exited non-zero — try the next one
    }
  }

  throw new Error(
    "Couldn't find a working Python install (tried: " + candidates.join(', ') + '). ' +
    'On Windows, this usually means Python is either not installed or the ' +
    '"python"/"python3" App Execution Alias stub is intercepting the command ' +
    'instead of a real install — install Python from python.org (check "Add ' +
    'python.exe to PATH" during setup) and/or turn the stub off in Settings > ' +
    'Apps > Advanced app settings > App execution aliases. You can also set ' +
    'the PYTHON_BIN environment variable to the exact command/path that works ' +
    'in your terminal.'
  );
}

/** Resets the cache — used by tests, and by server.js if a resolved
 * command turns out to actually be a stub after all (see server.js's
 * callPython, which double-checks the CLI's own stdout). */
function _resetCache() {
  resolvedPythonBin = null;
}

module.exports = { resolvePythonBin, WINDOWS_STUB_MARKER, _resetCache };
