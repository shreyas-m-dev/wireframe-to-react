const assert = require('assert');
const { diffTrees, autoCorrect, validateWithRetry } = require('./validate');
const { parseJsx } = require('../cgda/cgda');

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

test('diffTrees: exact match reports isValid true, accuracy 1.0', () => {
  const schema = { type: 'root', children: [{ type: 'button', id: 'b1', children: [] }] };
  const jsxTree = parseJsx('<div><button>Go</button></div>');
  const diff = diffTrees(schema, jsxTree);
  assert.strictEqual(diff.isValid, true);
  assert.strictEqual(diff.structuralAccuracy, 1);
});

test('diffTrees: missing schema node is reported', () => {
  const schema = {
    type: 'root',
    children: [
      { type: 'button', id: 'b1', children: [] },
      { type: 'text', id: 't1', children: [] },
    ],
  };
  const jsxTree = parseJsx('<div><button>Go</button></div>'); // text missing
  const diff = diffTrees(schema, jsxTree);
  assert.strictEqual(diff.isValid, false);
  assert.strictEqual(diff.missingInCode.length, 1);
  assert.strictEqual(diff.missingInCode[0].type, 'text');
  assert.strictEqual(diff.structuralAccuracy, 0.5);
});

test('diffTrees: extra unaccounted code tag is reported', () => {
  const schema = { type: 'root', children: [{ type: 'button', id: 'b1', children: [] }] };
  const jsxTree = parseJsx('<div><button>Go</button><canvas></canvas></div>');
  const diff = diffTrees(schema, jsxTree);
  assert.strictEqual(diff.isValid, false);
  assert.strictEqual(diff.extraInCode.length, 1);
  assert.strictEqual(diff.extraInCode[0].tag, 'canvas');
});

test('autoCorrect: synthesizes a trivial missing tag', () => {
  const diff = { missingInCode: [{ type: 'text', id: 't1' }] };
  const { autoFixed, stillMissing } = autoCorrect(diff);
  assert.strictEqual(autoFixed.length, 1);
  assert.strictEqual(autoFixed[0].insertedTag, 'p');
  assert.strictEqual(stillMissing.length, 0);
});

test('validateWithRetry: valid on first attempt needs no regeneration', () => {
  const schema = { type: 'root', children: [{ type: 'button', id: 'b1', children: [] }] };
  let regenCalls = 0;
  const result = validateWithRetry(schema, '<div><button>Go</button></div>', () => {
    regenCalls++;
    return '<div></div>';
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.attempts, 0);
  assert.strictEqual(regenCalls, 0);
});

test('validateWithRetry: loops back on extra hallucinated tag, converges on attempt 1', () => {
  const schema = { type: 'root', children: [{ type: 'button', id: 'b1', children: [] }] };
  const badJsx = '<div><button>Go</button><canvas></canvas></div>';
  const goodJsx = '<div><button>Go</button></div>';
  let regenCalls = 0;
  const result = validateWithRetry(schema, badJsx, () => {
    regenCalls++;
    return goodJsx;
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(regenCalls, 1);
  assert.strictEqual(result.log[0].result, 'needs-retry');
  assert.strictEqual(result.log[1].result, 'valid');
});

test('validateWithRetry: gives up after maxRetries and reports invalid', () => {
  const schema = { type: 'root', children: [{ type: 'button', id: 'b1', children: [] }] };
  const alwaysBadJsx = '<div><canvas></canvas></div>'; // never has a button, never fixable
  let regenCalls = 0;
  const result = validateWithRetry(schema, alwaysBadJsx, () => {
    regenCalls++;
    return alwaysBadJsx; // regenerate keeps producing the same broken output
  }, 2);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.attempts, 2);
  assert.strictEqual(regenCalls, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
