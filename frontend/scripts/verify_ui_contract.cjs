/* Dependency-free UI contract check for source-level regression coverage. */
const assert = require('assert');
const fs = require('fs');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const modal = fs.readFileSync('src/FullViewModal.jsx', 'utf8');

assert(!/Export ZIP|Download project|exportProject/.test(app), 'export/download UI must not be reachable');
assert(app.includes('FullViewModal'), 'App must use the reusable full-view modal');
assert(app.includes("setFullView('source')"), 'source full view trigger missing');
assert(app.includes("setFullView('preview')"), 'preview full view trigger missing');
assert(app.includes('code={result.code}'), 'preview must consume canonical result.code');
assert(modal.includes('aria-modal="true"') && modal.includes('Escape'), 'dialog accessibility/escape handling missing');
assert(modal.includes('requestFullscreen') && modal.includes('document.exitFullscreen'), 'optional fullscreen controls missing');
assert(modal.includes('clientWidth') && modal.includes('scrollWidth') && modal.includes('ResizeObserver'), 'full view must calculate measured fit and recompute on resize');
assert(modal.includes('setZoom(fitScale)'), 'reset must return to fitted scale');
console.log('PASS: frontend full-view/export/artifact source contract');
