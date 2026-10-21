'use strict';
/**
 * Live smoke test against a running API (local or staging), using a real
 * Supabase session. Creates a project, uploads a wireframe, waits for the job,
 * checks result/export, then deletes the project it created.
 *
 *   API_BASE=http://localhost:3000 ACCESS_TOKEN=<supabase access token> \
 *     node scripts/smoke_api.js services/fixtures/uploads/landing-wireframe.jpeg
 *
 * Get ACCESS_TOKEN from a signed-in browser session (never commit it).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const base = process.env.API_BASE || 'http://localhost:3000';
const token = process.env.ACCESS_TOKEN;
const image = process.argv[2];
if (!token || !image) throw new Error('usage: API_BASE=… ACCESS_TOKEN=… node scripts/smoke_api.js <image>');

async function call(method, route, { json, form } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (json) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${route}`, { method, headers, body: form || (json ? JSON.stringify(json) : undefined) });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${JSON.stringify(body?.error || '')}`);
  return body;
}

async function main() {
  const anonymous = await fetch(`${base}/api/me`);
  assert.strictEqual(anonymous.status, 401, 'API must reject unauthenticated requests');
  const { project } = await call('POST', '/api/projects', { json: { name: `smoke ${new Date().toISOString()}` } });
  try {
    const form = new FormData();
    form.append('wireframe', new Blob([fs.readFileSync(image)]), path.basename(image));
    form.append('instructions', 'Use a dark theme with rounded blue buttons.');
    let { job } = await call('POST', `/api/projects/${project.id}/jobs`, { form });
    const started = Date.now();
    while (['queued', 'running'].includes(job.status)) {
      if (Date.now() - started > 300_000) throw new Error(`job stuck in ${job.status}/${job.stage}`);
      await new Promise((r) => setTimeout(r, 2000));
      ({ job } = await call('GET', `/api/jobs/${job.id}`));
    }
    assert.ok(['complete', 'low_fidelity'].includes(job.status), `job ended ${job.status}: ${JSON.stringify(job.error)}`);
    const result = await call('GET', `/api/jobs/${job.id}/result`);
    assert.ok(result.code && result.code.length > 100, 'generated code missing');
    assert.ok(result.preview?.js, 'compiled preview missing');
    const zip = await call('GET', `/api/jobs/${job.id}/export`);
    assert.strictEqual(zip.subarray(0, 2).toString(), 'PK');
    console.log(JSON.stringify({ pass: true, status: job.status, seconds: Math.round((Date.now() - started) / 1000), codeBytes: result.code.length, coverage: result.validation?.diff?.structuralAccuracy }));
  } finally {
    await call('DELETE', `/api/projects/${project.id}`);
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
