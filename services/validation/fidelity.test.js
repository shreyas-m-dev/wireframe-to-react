'use strict';
const { evaluateFidelity } = require('./fidelity');
let failed = 0;
function test(name, fn) { try { fn(); console.log(`PASS  ${name}`); } catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); } }
const node = (type, role, children = []) => ({ type, role, children });
test('reports a product-page skeleton as visual comparison pending', () => {
  const schema = node('root', null, [node('container','page',[node('container','header',[node('text',null),node('button',null)]),node('container','main',[node('container','gallery',[node('image',null),node('image',null)]),node('container','product-detail',[node('text',null),node('text',null),node('button',null)])]),node('container','footer',[node('text',null)])])]);
  const result = evaluateFidelity(schema); if (!result.visualComparisonPending || result.passed) throw new Error(JSON.stringify(result));
});
test('rejects a page represented by only repeated buttons', () => {
  const schema = node('root', null, [node('container','page',[node('container','main',[node('button',null),node('button',null),node('button',null)])])]);
  const result = evaluateFidelity(schema); if (result.passed) throw new Error('collapsed page incorrectly passed');
});
test('does not mark local fallback output ready even with a supplied visual score', () => {
  const schema = node('root', null, [node('container', 'page', [node('container', 'header', [node('text', 'nav-link')]), node('container', 'main', [node('container', 'hero-section', [node('text', 'hero-heading')]), node('container', 'media-region', [node('image', 'media')])])])]);
  const result = evaluateFidelity(schema, { schemaSource: 'local-cv-ocr-fallback', sourceVsRenderedScore: 0.93 });
  if (result.passed || result.overallStatus !== 'needs-review') throw new Error(JSON.stringify(result));
});
test('requires an actual source-rendered comparison before ready', () => {
  const schema = node('root', null, [node('container', 'page', [node('container', 'header', [node('text', 'nav-link')]), node('container', 'main', [node('container', 'hero-section', [node('text', 'hero-heading')]), node('container', 'media-region', [node('image', 'media')])])])]);
  const result = evaluateFidelity(schema, { schemaSource: 'vision-merged' });
  if (result.passed || !result.visualComparisonPending) throw new Error(JSON.stringify(result));
});
test('accepts a non-form contact action as structurally safe', () => {
  const schema = node('root', null, [node('container', 'page', [
    node('container', 'main', [node('container', 'contact-section', [node('button', 'action')])]),
  ])]);
  const result = evaluateFidelity(schema, { schemaSource: 'local-cv-ocr-fallback' });
  if (result.looseContactControlCount !== 0) throw new Error(JSON.stringify(result));
});
if (failed) process.exit(1); console.log('5 passed');
