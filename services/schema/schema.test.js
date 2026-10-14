/**
 * Zero-dependency test runner for schema.js. Run: node schema.test.js
 * Uses hand-crafted bounding-box lists, independent of YOLO output, per
 * build order step 3.
 */

const assert = require('assert');
const {
  groupIntoRows,
  isContainedIn,
  buildSchema,
  flattenSchema,
} = require('./schema');

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

test('groupIntoRows: two elements at same Y band land in one row', () => {
  const elements = [
    { type: 'button', x: 10, y: 10, width: 50, height: 20 },
    { type: 'button', x: 100, y: 12, width: 50, height: 20 },
    { type: 'text', x: 10, y: 100, width: 200, height: 20 },
  ];
  const rows = groupIntoRows(elements);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].length, 2);
  assert.strictEqual(rows[1].length, 1);
});

test('groupIntoRows: elements with no vertical overlap are separate rows', () => {
  const elements = [
    { type: 'text', x: 0, y: 0, width: 50, height: 20 },
    { type: 'text', x: 0, y: 40, width: 50, height: 20 },
    { type: 'text', x: 0, y: 80, width: 50, height: 20 },
  ];
  const rows = groupIntoRows(elements);
  assert.strictEqual(rows.length, 3);
});

test('isContainedIn: label fully inside button counts as contained', () => {
  const button = { x: 0, y: 0, width: 100, height: 40 };
  const label = { x: 10, y: 10, width: 60, height: 20 };
  assert.strictEqual(isContainedIn(label, button), true);
});

test('isContainedIn: sibling elements are not contained in each other', () => {
  const a = { x: 0, y: 0, width: 50, height: 40 };
  const b = { x: 60, y: 0, width: 50, height: 40 };
  assert.strictEqual(isContainedIn(a, b), false);
  assert.strictEqual(isContainedIn(b, a), false);
});

test('buildSchema: nests text label inside a button container', () => {
  const elements = [
    { type: 'button', confidence: 0.9, x: 0, y: 0, width: 100, height: 40 },
    { type: 'text', confidence: 0.8, x: 10, y: 10, width: 60, height: 20 },
  ];
  const schema = buildSchema(elements);
  assert.strictEqual(schema.children.length, 1);
  assert.strictEqual(schema.children[0].type, 'button');
  assert.strictEqual(schema.children[0].children.length, 1);
  assert.strictEqual(schema.children[0].children[0].type, 'text');
});

test('buildSchema: header row elements are ordered left-to-right', () => {
  const elements = [
    { type: 'button', confidence: 0.9, x: 200, y: 0, width: 50, height: 20 },
    { type: 'button', confidence: 0.9, x: 10, y: 0, width: 50, height: 20 },
    { type: 'text', confidence: 0.9, x: 100, y: 0, width: 50, height: 20 },
  ];
  const schema = buildSchema(elements);
  assert.strictEqual(schema.children.length, 3);
  assert.deepStrictEqual(
    schema.children.map((c) => c.bbox.x),
    [10, 100, 200]
  );
});

test('buildSchema: three-level nesting (container > row > button)', () => {
  const elements = [
    { type: 'container', confidence: 0.9, x: 0, y: 0, width: 300, height: 100 },
    { type: 'button', confidence: 0.9, x: 10, y: 10, width: 80, height: 30 },
    { type: 'text', confidence: 0.9, x: 20, y: 18, width: 40, height: 14 },
  ];
  const schema = buildSchema(elements);
  assert.strictEqual(schema.children.length, 1);
  const container = schema.children[0];
  assert.strictEqual(container.type, 'container');
  assert.strictEqual(container.children.length, 1);
  assert.strictEqual(container.children[0].type, 'button');
  assert.strictEqual(container.children[0].children.length, 1);
  assert.strictEqual(container.children[0].children[0].type, 'text');
});

test('buildSchema: empty input returns empty root', () => {
  const schema = buildSchema([]);
  assert.strictEqual(schema.type, 'root');
  assert.strictEqual(schema.children.length, 0);
});

test('flattenSchema: counts all non-root nodes including nested', () => {
  const elements = [
    { type: 'container', confidence: 0.9, x: 0, y: 0, width: 300, height: 100 },
    { type: 'button', confidence: 0.9, x: 10, y: 10, width: 80, height: 30 },
    { type: 'text', confidence: 0.9, x: 20, y: 18, width: 40, height: 14 },
  ];
  const schema = buildSchema(elements);
  const flat = flattenSchema(schema);
  assert.strictEqual(flat.length, 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
