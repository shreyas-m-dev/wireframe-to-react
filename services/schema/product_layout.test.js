'use strict';
const { buildSchema } = require('./schema');
let failed = 0;
function test(name, fn) { try { fn(); console.log(`PASS  ${name}`); } catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); } }
const e = (type, x, y, width, height, role = null) => ({ type, x, y, width, height, confidence: .9, role });
test('builds role-first product page hierarchy instead of a leaf bag', () => {
  const schema = buildSchema([
    e('container',0,0,1000,1000,'page'), e('container',0,0,1000,90,'header'), e('container',0,90,1000,820,'main'), e('container',0,910,1000,90,'footer'),
    e('container',0,90,520,560,'gallery'), e('container',520,90,480,560,'product-detail'), e('container',0,650,1000,260,'related-products'),
    e('image',30,120,440,420), e('text',550,130,250,36), e('text',550,185,100,26), e('text',550,230,340,90), e('button',550,350,220,48),
    e('container',20,680,210,190), e('container',270,680,210,190), e('container',520,680,210,190), e('container',770,680,210,190),
  ]);
  const page = schema.children.find(n => n.role === 'page');
  const main = page.children.find(n => n.role === 'main');
  const gallery = main.children.find(n => n.role === 'gallery');
  const detail = main.children.find(n => n.role === 'product-detail');
  const related = main.children.find(n => n.role === 'related-products');
  if (!gallery.children.some(n => n.type === 'image')) throw new Error('gallery lost image');
  if (!detail.children.some(n => n.type === 'button')) throw new Error('detail lost CTA');
  if (!related.layout.repeated || related.layout.direction !== 'grid') throw new Error('related cards lost grid grouping');
});
if (failed) process.exit(1); console.log('1 passed');
