const assert = require('assert');
const { parseJsx, buildWhitelist, runCgda } = require('./cgda');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message}\n${e.stack}`);
    failed++;
  }
}

test('parseJsx: parses nested tags with correct children', () => {
  const jsx = '<div><button>Click</button></div>';
  const tree = parseJsx(jsx);
  assert.strictEqual(tree.tag, 'div');
  assert.strictEqual(tree.children.length, 1);
  assert.strictEqual(tree.children[0].tag, 'button');
});

test('parseJsx: handles self-closing tags', () => {
  const jsx = '<div><img src={x} /></div>';
  const tree = parseJsx(jsx);
  assert.strictEqual(tree.children[0].tag, 'img');
  assert.strictEqual(tree.children[0].selfClosing, true);
});

test('buildWhitelist: schema with button and text allows button/a and p/span/h1..', () => {
  const schema = { type: 'root', children: [{ type: 'button', children: [] }, { type: 'text', children: [] }] };
  const wl = buildWhitelist(schema);
  assert.ok(wl.has('button'));
  assert.ok(wl.has('p'));
  assert.ok(!wl.has('canvas'));
});

test('runCgda: THE HEADLINE EXAMPLE — strips a hallucinated <canvas> not in schema', () => {
  const schema = {
    type: 'root',
    children: [{ type: 'button', children: [] }],
  };
  const rawJsx = '<div><button>Click me</button><canvas id="chart"></canvas></div>';
  const { cleanedJsx, report, hallucinationRate } = runCgda(rawJsx, schema);

  assert.ok(cleanedJsx.includes('<button>'));
  assert.ok(!cleanedJsx.includes('<canvas'), 'canvas should be stripped');
  assert.strictEqual(report.stripped.length, 1);
  assert.strictEqual(report.stripped[0].tag, 'canvas');
  assert.ok(hallucinationRate > 0);
});

test('runCgda: keeps everything when generated JSX matches schema exactly', () => {
  const schema = {
    type: 'root',
    children: [
      { type: 'container', children: [{ type: 'button', children: [] }, { type: 'text', children: [] }] },
    ],
  };
  const rawJsx = '<div><section><button>Go</button><p>Hello</p></section></div>';
  const { report, hallucinationRate } = runCgda(rawJsx, schema);
  assert.strictEqual(report.stripped.length, 0);
  assert.strictEqual(hallucinationRate, 0);
});

test('runCgda: strips a hallucinated wrapper AND everything nested inside it', () => {
  const schema = { type: 'root', children: [{ type: 'button', children: [] }] };
  // hallucinated <aside> wraps a legit-looking <button>, but since <aside>
  // has no schema container backing it, the whole subtree is unaccountable
  const rawJsx = '<div><aside><button>Ghost</button></aside></div>';
  const { cleanedJsx, report } = runCgda(rawJsx, schema);
  assert.ok(!cleanedJsx.includes('aside'));
  assert.ok(!cleanedJsx.includes('Ghost'), 'nested content of a stripped hallucinated wrapper should also be gone');
  assert.strictEqual(report.stripped.length, 1);
  assert.strictEqual(report.stripped[0].tag, 'aside');
});

test('runCgda: multiple hallucinations in one pass are all reported', () => {
  const schema = { type: 'root', children: [{ type: 'text', children: [] }] };
  const rawJsx = '<div><p>Real</p><canvas></canvas><video></video></div>';
  const { report } = runCgda(rawJsx, schema);
  assert.strictEqual(report.stripped.length, 2);
  const strippedTags = report.stripped.map((s) => s.tag).sort();
  assert.deepStrictEqual(strippedTags, ['canvas', 'video']);
});

test('REGRESSION: text content inside a leaf tag is preserved, not dropped', () => {
  // A real bug found during review: text directly inside a tag (right
  // before ITS OWN closing tag) was being silently discarded by the
  // parser/serializer round-trip — every button label, link, and text
  // node's actual content vanished on every single request through the
  // real backend path (server.js always runs generated code through
  // runCgda before returning it to the client).
  const schema = { type: 'root', children: [{ type: 'button', children: [] }] };
  const rawJsx = '<div><button className="px-4 py-2">Button 1</button></div>';
  const { cleanedJsx } = runCgda(rawJsx, schema);
  assert.ok(cleanedJsx.includes('Button 1'), `expected "Button 1" text preserved, got: ${cleanedJsx}`);
});

test('REGRESSION: trailing content after the outermost closing tag is preserved', () => {
  // Same bug, different symptom: the compiler's full-file output
  // (import/export/function wrapper) has real content AFTER the last
  // closing tag — the `);\n}\n` that closes the return statement and
  // function body. That was being truncated entirely.
  const schema = { type: 'root', children: [{ type: 'button', children: [] }] };
  const rawJsx = 'import React from "react";\n\nexport default function GeneratedComponent() {\n  return (\n<div><button>Go</button></div>\n  );\n}\n';
  const { cleanedJsx } = runCgda(rawJsx, schema);
  assert.ok(cleanedJsx.includes('import React'), 'leading boilerplate should survive');
  assert.ok(cleanedJsx.trim().endsWith('}'), `expected trailing "}" preserved, got: ${JSON.stringify(cleanedJsx.slice(-20))}`);
});

test('REGRESSION: text content survives even when a sibling tag gets stripped', () => {
  // Combines both bugs: a hallucinated tag next to a real one with text —
  // confirms the fix and the whitelist filter compose correctly together.
  const schema = { type: 'root', children: [{ type: 'text', children: [] }] };
  const rawJsx = '<div><p>Real label</p><canvas>fake</canvas></div>';
  const { cleanedJsx, report } = runCgda(rawJsx, schema);
  assert.ok(cleanedJsx.includes('Real label'));
  assert.ok(!cleanedJsx.includes('canvas'));
  assert.strictEqual(report.stripped.length, 1);
});

test('REGRESSION: preserves compiler conditional JSX when no filtering is needed', () => {
  const schema = { type: 'root', children: [{ type: 'region', role: 'form', children: [{ type: 'input', children: [] }, { type: 'button', children: [] }, { type: 'text', children: [] }] }] };
  const raw = 'import React from "react"; export default function GeneratedComponent(){ return (<form><input /><button type="submit">SEND</button>{submitted && (<p role="status">Message sent locally.</p>)}</form>); }';
  const result = runCgda(raw, schema);
  assert.strictEqual(result.cleanedJsx, raw);
  assert.deepStrictEqual(result.structuralViolations, []);
});

test('reports void closing tags and submit actions outside forms', () => {
  const schema = { type: 'root', children: [{ type: 'input', children: [] }, { type: 'button', children: [] }] };
  const result = runCgda('export default function GeneratedComponent(){ return (<div><input></input><button type="submit">SEND</button></div>); }', schema);
  assert.ok(result.structuralViolations.some(item => item.type === 'void-closing-tag'));
  assert.ok(result.structuralViolations.some(item => item.type === 'submit-outside-form'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
