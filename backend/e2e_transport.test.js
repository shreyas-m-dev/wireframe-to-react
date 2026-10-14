'use strict';
// Exercises the same staged HTTP endpoints used by frontend/src/App.jsx.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const base = process.env.API_BASE || 'http://localhost:3000';
const image = process.argv[2];
if (!image) throw new Error('usage: node backend/e2e_transport.test.js <image>');

async function post(route, body) {
  const response = await fetch(`${base}${route}`, { method: 'POST', body, headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${route}: ${payload.error || response.status}`);
  return payload;
}
async function main() {
  const initialVision = await (await fetch(`${base}/api/vision/status`)).json();
  assert(typeof initialVision.apiKeyConfigured === 'boolean' && !JSON.stringify(initialVision).includes(process.env.VISION_API_KEY || '__missing__'), 'vision endpoint leaked a key');
  const form = new FormData();
  form.append('wireframe', new Blob([fs.readFileSync(image)], { type: 'image/png' }), path.basename(image));
  const uploaded = await post('/api/upload', form); const jobId = uploaded.job.id;
  const body = (extra = {}) => JSON.stringify({ jobId, ...extra });
  await post('/api/process', body());
  await post('/api/detect', body({ instructions: 'Use a dark theme with rounded blue buttons.' }));
  await post('/api/schema', body());
  await post('/api/generate', body({ instructions: 'Use a dark theme with rounded blue buttons.' }));
  await post('/api/validate', body({ instructions: 'Use a dark theme with rounded blue buttons.' }));
  const result = await (await fetch(`${base}/api/job/${jobId}/result`)).json();
  assert(typeof result.code === 'string' && result.code.length > 100, 'validated code is missing');
  assert(result.job.finalArtifact?.id, 'final artifact is missing');
  const finalVision = await (await fetch(`${base}/api/vision/status`)).json();
  assert(['success', 'fallback', 'disabled', 'not-run', 'timeout', 'invalid-schema', 'provider-error'].includes(finalVision.lastVisionCallStatus), 'unsafe vision status');
  console.log(JSON.stringify({ pass: true, jobId, codeBytes: Buffer.byteLength(result.code), status: result.job.status, vision: result.job.detectionMeta?.vision?.used || false, schemaSource: result.job.schemaSource, visionStatus: finalVision.lastVisionCallStatus }));
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
