'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateGeneratedJsx, validateDependencyManifest, compilePreview } = require('../src/pipeline/compile');
const { classifyPythonError, childEnv, assertShortArguments } = require('../src/pipeline/python');
const { visionSummary } = require('../src/pipeline/pipeline');

test('parser gate accepts valid generated JSX and rejects adjacent roots', () => {
  const valid = 'import React from "react"; export default function GeneratedComponent(){ return (<form><input /><button type="submit">SEND</button>{true && (<p role="status">Message sent locally.</p>)}</form>); }';
  const invalid = 'export default function GeneratedComponent(){ return (<form><input />{submitted && <p>Message</p>}</form><div />); }';
  assert.strictEqual(validateGeneratedJsx(valid).valid, true);
  assert.strictEqual(validateGeneratedJsx(invalid).valid, false);
});

test('compilePreview turns a JSX module into plain JS exposing the default component', () => {
  const { js, componentName } = compilePreview('import React, { useState } from "react";\nimport x from "./x";\nexport const helper = 1;\nexport default function Page(){ const [n] = useState(0); return <div className="p-4">{n}</div>; }');
  assert.strictEqual(componentName, 'Page');
  assert.ok(!/\bimport\b|\bexport\b/.test(js), 'no module syntax remains');
  assert.match(js, /React\.createElement\("div"/);
  const Page = new Function('React', 'useState', `${js}\nreturn ${componentName};`)({ createElement: (t, p, ...c) => ({ t, p, c }) }, () => [7]);
  assert.deepStrictEqual(Page(), { t: 'div', p: { className: 'p-4' }, c: [7] });
});

test('compilePreview handles anonymous default exports and rejects modules without one', () => {
  assert.strictEqual(compilePreview('export default () => <p/>;').componentName, '__GeneratedDefault');
  assert.throws(() => compilePreview('const a = <p/>;'), /default-exported component/);
});

test('dependency manifest check finds undefined state and handlers', () => {
  const result = validateDependencyManifest('function C(){ return <button onClick={handleBuy}>{count}</button>; }', { state: ['count'], handlers: ['handleBuy'] });
  assert.deepStrictEqual(result.failures, ['undefined state: count', 'undefined handler: handleBuy']);
});

test('python errors are classified into messages without paths or internals', () => {
  const cases = [
    ['Invalid image: File could not be decoded as an image (corrupt or unsupported format).', 'invalid_image'],
    [String.raw`File not found: C:\Users\someone\AppData\Local\Temp\x.png`, 'invalid_image'],
    ['No UI elements detected in this image. Try a wireframe…', 'nothing_detected'],
    ['Traceback (most recent call last): File "/srv/app/services/x.py"', 'pipeline_failed'],
  ];
  for (const [raw, code] of cases) {
    const error = classifyPythonError(raw);
    assert.strictEqual(error.code, code);
    assert.ok(!/[A-Z]:\\|\/srv\/|Traceback/.test(error.userMessage), error.userMessage);
  }
});

test('the Python child process never receives API secrets', () => {
  const env = childEnv({ PATH: '/bin', DATABASE_URL: 'postgres://u:p@h/db', SUPABASE_JWT_SECRET: 's', SUPABASE_URL: 'https://x', GEN_MODE: 'template', VISION_ENABLED: 'false', GEMINI_API_KEY: 'k', TESSERACT_CMD: 't' });
  assert.deepStrictEqual(Object.keys(env).sort(), ['GEMINI_API_KEY', 'GEN_MODE', 'PATH', 'TESSERACT_CMD', 'VISION_ENABLED']);
});

test('argv transport guard rejects oversized arguments (Windows command-line limit)', () => {
  assert.throws(() => assertShortArguments(['x'.repeat(9000)]), /file transport/);
  assert.doesNotThrow(() => assertShortArguments(['detect', '/tmp/a.png']));
});

test('vision summary reports a disabled provider as disabled, not as a provider error', () => {
  const summary = visionSummary({ status: { enabled: false }, errorMeta: { category: 'provider-error' }, reason: 'disabled' });
  assert.strictEqual(summary.status, 'disabled');
  assert.strictEqual(summary.schemaSource, 'local-cv-ocr');
});

test('undeclared identifiers are found (code that parses but crashes on render)', () => {
  const { findUndeclaredIdentifiers } = require('../src/pipeline/compile');
  // The real failure: an input bound to formData with no useState declaration.
  const broken = 'import React from "react";\nexport default function GeneratedComponent() {\n  return (<div><input value={formData.message} onChange={(e) => setFormData({ message: e.target.value })} /></div>);\n}\n';
  assert.deepStrictEqual(findUndeclaredIdentifiers(broken), ['formData', 'setFormData']);
  const fine = 'import React, { useState } from "react";\nexport default function C() { const [formData, setFormData] = useState({ message: "" }); return (<div><Icon name="x" /><input value={formData.message} onChange={(e) => setFormData({ message: e.target.value })} />{Math.round(1.2)}</div>); }';
  assert.deepStrictEqual(findUndeclaredIdentifiers(fine), []);
  // Imports other than React's are stripped by the preview, so they count as undefined.
  assert.deepStrictEqual(findUndeclaredIdentifiers('import Card from "./Card";\nexport default function C() { return <Card />; }'), ['Card']);
});
