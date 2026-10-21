'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { setup, fakeResult, PNG, SAMPLE_JSX } = require('./helpers');
const { PipelineError } = require('../src/pipeline/python');

async function waitForStatus(h, token, jobId, statuses, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await h.api('GET', `/api/jobs/${jobId}`, { token });
    if (statuses.includes(res.body.job?.status)) return res.body.job;
    if (Date.now() > deadline) throw new Error(`job ${jobId} stuck in ${res.body.job?.status}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function newProjectWithJob(h, user, name = 'Landing page') {
  const project = (await h.api('POST', '/api/projects', { token: user.token, body: { name } })).body.project;
  const created = await h.api('POST', `/api/projects/${project.id}/jobs`, { token: user.token, form: h.upload(PNG, 'landing.png', 'Use a dark theme') });
  assert.strictEqual(created.status, 202, JSON.stringify(created.body));
  const job = await waitForStatus(h, user.token, created.body.job.id, ['complete']);
  return { project, job };
}

test('end-to-end job lifecycle: create project → upload → background run → result → source → export', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    const { project, job } = await newProjectWithJob(h, user);
    assert.strictEqual(job.projectId, project.id);
    assert.strictEqual(job.instructions, 'Use a dark theme');
    assert.strictEqual(job.source.mime, 'image/png');

    const result = await h.api('GET', `/api/jobs/${job.id}/result`, { token: user.token });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.code, SAMPLE_JSX);
    assert.strictEqual(result.body.preview.componentName, 'GeneratedComponent');
    assert.match(result.body.artifact.sha256, /^[0-9a-f]{64}$/);

    const source = await h.api('GET', `/api/jobs/${job.id}/source`, { token: user.token });
    assert.strictEqual(source.status, 200);
    assert.ok(Buffer.compare(source.body, PNG) === 0, 'source bytes round-trip');
    assert.strictEqual(source.headers.get('cache-control'), 'private, no-store');

    const zip = await h.api('GET', `/api/jobs/${job.id}/export`, { token: user.token });
    assert.strictEqual(zip.status, 200);
    assert.strictEqual(zip.headers.get('content-type'), 'application/zip');
    assert.strictEqual(zip.body.subarray(0, 4).toString('hex'), '504b0304');
    for (const file of ['package.json', 'index.html', 'src/main.jsx', 'src/GeneratedComponent.jsx']) assert.ok(zip.body.includes(Buffer.from(file)), `zip contains ${file}`);

    const list = await h.api('GET', `/api/projects/${project.id}/jobs`, { token: user.token });
    assert.deepStrictEqual(list.body.jobs.map((j) => j.id), [job.id]);

    // Persisted, not in memory: a fresh repository sees the same job.
    const row = await h.repos.jobs.get(user.id, job.id);
    assert.strictEqual(row.status, 'complete');
  } finally { await h.close(); }
});

test('broken object-level authorization: another user cannot see or touch any of my objects', async () => {
  const h = await setup();
  try {
    const alice = await h.createUser();
    const mallory = await h.createUser();
    const { project, job } = await newProjectWithJob(h, alice);

    const attempts = [
      ['GET', `/api/projects/${project.id}`], ['PATCH', `/api/projects/${project.id}`, { name: 'pwned' }], ['DELETE', `/api/projects/${project.id}`],
      ['GET', `/api/projects/${project.id}/jobs`], ['GET', `/api/jobs/${job.id}`], ['GET', `/api/jobs/${job.id}/result`],
      ['GET', `/api/jobs/${job.id}/source`], ['GET', `/api/jobs/${job.id}/export`], ['POST', `/api/jobs/${job.id}/cancel`],
      ['POST', `/api/jobs/${job.id}/regenerate`, {}], ['DELETE', `/api/jobs/${job.id}`],
    ];
    for (const [method, route, body] of attempts) {
      const res = await h.api(method, route, { token: mallory.token, body });
      assert.strictEqual(res.status, 404, `${method} ${route} → ${res.status}`);
      assert.strictEqual(res.body.error.code, 'not_found');
    }
    const upload = await h.api('POST', `/api/projects/${project.id}/jobs`, { token: mallory.token, form: h.upload() });
    assert.strictEqual(upload.status, 404, 'cannot add jobs to a foreign project');

    // Mallory's own listing never includes Alice's data.
    assert.deepStrictEqual((await h.api('GET', '/api/projects', { token: mallory.token })).body.projects, []);

    // Nothing changed for Alice.
    assert.strictEqual((await h.api('GET', `/api/projects/${project.id}`, { token: alice.token })).body.project.name, 'Landing page');
    assert.strictEqual((await h.api('GET', `/api/jobs/${job.id}`, { token: alice.token })).body.job.status, 'complete');
  } finally { await h.close(); }
});

test('ownership comes from the token only: owner fields in the body are ignored', async () => {
  const h = await setup();
  try {
    const alice = await h.createUser();
    const mallory = await h.createUser();
    const res = await h.api('POST', '/api/projects', { token: mallory.token, body: { name: 'Mine', owner_id: alice.id, ownerId: alice.id, userId: alice.id } });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual((await h.api('GET', '/api/projects', { token: alice.token })).body.projects, []);
    assert.strictEqual((await h.api('GET', '/api/projects', { token: mallory.token })).body.projects.length, 1);
  } finally { await h.close(); }
});

test('malformed ids are a 404, not a 500', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    for (const route of ['/api/projects/not-a-uuid', "/api/jobs/1' or '1'='1", '/api/jobs/..%2F..%2Fetc%2Fpasswd/source']) {
      const res = await h.api('GET', route, { token: user.token });
      assert.strictEqual(res.status, 404, route);
    }
  } finally { await h.close(); }
});

test('uploads: type is decided by magic bytes; missing and oversized files are rejected', async () => {
  const h = await setup({ env: { MAX_UPLOAD_BYTES: '4096' } });
  try {
    const user = await h.createUser();
    const project = (await h.api('POST', '/api/projects', { token: user.token, body: { name: 'P' } })).body.project;
    const route = `/api/projects/${project.id}/jobs`;

    const fake = await h.api('POST', route, { token: user.token, form: h.upload(Buffer.from('not really an image'), 'evil.png') });
    assert.strictEqual(fake.status, 415);
    const html = await h.api('POST', route, { token: user.token, form: h.upload(Buffer.from('<script>alert(1)</script>'), 'x.jpg') });
    assert.strictEqual(html.status, 415);

    const none = await h.api('POST', route, { token: user.token, form: new FormData() });
    assert.strictEqual(none.status, 400);
    assert.strictEqual(none.body.error.code, 'file_required');

    const big = await h.api('POST', route, { token: user.token, form: h.upload(Buffer.concat([PNG, Buffer.alloc(8192)]), 'big.png') });
    assert.strictEqual(big.status, 413);

    const longInstructions = await h.api('POST', route, { token: user.token, form: h.upload(PNG, 'ok.png', 'x'.repeat(1501)) });
    assert.strictEqual(longInstructions.status, 422);

    // A path-like filename is reduced to a safe base name.
    const traversal = await h.api('POST', route, { token: user.token, form: h.upload(PNG, '../../etc/passwd.png') });
    assert.strictEqual(traversal.status, 202);
    assert.strictEqual(traversal.body.job.source.filename, 'passwd.png');
  } finally { await h.close(); }
});

test('idempotency: retrying with the same key returns the original job', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    const project = (await h.api('POST', '/api/projects', { token: user.token, body: { name: 'P' } })).body.project;
    const headers = { 'Idempotency-Key': 'retry-key-12345' };
    const first = await h.api('POST', `/api/projects/${project.id}/jobs`, { token: user.token, form: h.upload(), headers });
    const second = await h.api('POST', `/api/projects/${project.id}/jobs`, { token: user.token, form: h.upload(), headers });
    assert.strictEqual(first.status, 202);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.body.replayed, true);
    assert.strictEqual(second.body.job.id, first.body.job.id);
    await h.runner.idle();
    assert.strictEqual((await h.api('GET', `/api/projects/${project.id}/jobs`, { token: user.token })).body.jobs.length, 1);
  } finally { await h.close(); }
});

test('quotas and cancellation: active-job limit returns 429; a running job can be cancelled', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pipeline = async (_job, { signal, onStage }) => {
    await onStage('detect');
    await Promise.race([gate, new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))]);
    return fakeResult();
  };
  const h = await setup({ pipeline, env: { MAX_ACTIVE_JOBS_PER_USER: '2' } });
  try {
    const user = await h.createUser();
    const project = (await h.api('POST', '/api/projects', { token: user.token, body: { name: 'P' } })).body.project;
    const route = `/api/projects/${project.id}/jobs`;
    const a = await h.api('POST', route, { token: user.token, form: h.upload() });
    const b = await h.api('POST', route, { token: user.token, form: h.upload() });
    assert.strictEqual(a.status, 202);
    assert.strictEqual(b.status, 202);
    const c = await h.api('POST', route, { token: user.token, form: h.upload() });
    assert.strictEqual(c.status, 429);
    assert.strictEqual(c.body.error.code, 'too_many_active_jobs');
    assert.ok(c.headers.get('retry-after'));

    await waitForStatus(h, user.token, a.body.job.id, ['running']);
    const cancel = await h.api('POST', `/api/jobs/${a.body.job.id}/cancel`, { token: user.token });
    assert.strictEqual(cancel.status, 202);
    const cancelled = await waitForStatus(h, user.token, a.body.job.id, ['cancelled']);
    assert.strictEqual(cancelled.error.code, 'cancelled');

    release();
    await waitForStatus(h, user.token, b.body.job.id, ['complete']);
    const again = await h.api('POST', `/api/jobs/${a.body.job.id}/cancel`, { token: user.token });
    assert.strictEqual(again.status, 409, 'finished jobs are not cancellable');
  } finally { release(); await h.close(); }
});

test('pipeline failures surface a safe message and never internal detail', async () => {
  const pipeline = async () => { throw new PipelineError('invalid_image', 'The image could not be processed.', 'Traceback: C:\\secret\\path\\preprocess.py line 89 DATABASE_URL=postgres://x'); };
  const h = await setup({ pipeline });
  try {
    const user = await h.createUser();
    const project = (await h.api('POST', '/api/projects', { token: user.token, body: { name: 'P' } })).body.project;
    const created = await h.api('POST', `/api/projects/${project.id}/jobs`, { token: user.token, form: h.upload() });
    const job = await waitForStatus(h, user.token, created.body.job.id, ['failed']);
    assert.deepStrictEqual(job.error, { code: 'invalid_image', message: 'The image could not be processed.' });
    assert.ok(!JSON.stringify(job).includes('secret'), 'no internal detail in API output');
    const result = await h.api('GET', `/api/jobs/${job.id}/result`, { token: user.token });
    assert.strictEqual(result.status, 409);
  } finally { await h.close(); }
});

test('unexpected server errors return a generic 500 with a request id and no stack', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    h.repos.projects.list = async () => { throw new Error('connection to db.internal:5432 refused'); };
    const res = await h.api('GET', '/api/projects', { token: user.token });
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error.code, 'internal_error');
    assert.ok(!JSON.stringify(res.body).includes('5432'));
    assert.strictEqual(res.body.error.requestId, res.headers.get('x-request-id'));
    assert.ok(h.logs.some((l) => l.event === 'http.unhandled_error' && l.message.includes('5432')), 'detail is logged server-side');
  } finally { await h.close(); }
});

test('regenerate creates a new job from the stored source with new instructions', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    const { job } = await newProjectWithJob(h, user);
    const regen = await h.api('POST', `/api/jobs/${job.id}/regenerate`, { token: user.token, body: { instructions: 'Rounded blue buttons' } });
    assert.strictEqual(regen.status, 202);
    assert.strictEqual(regen.body.job.parentJobId, job.id);
    assert.strictEqual(regen.body.job.instructions, 'Rounded blue buttons');
    await waitForStatus(h, user.token, regen.body.job.id, ['complete']);
    // Deleting the parent does not remove the child's copy of the image.
    assert.strictEqual((await h.api('DELETE', `/api/jobs/${job.id}`, { token: user.token })).status, 204);
    assert.strictEqual((await h.api('GET', `/api/jobs/${regen.body.job.id}/source`, { token: user.token })).status, 200);
  } finally { await h.close(); }
});

test('deleting a project removes its jobs, results and stored images', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    const { project, job } = await newProjectWithJob(h, user);
    const row = await h.repos.jobs.get(user.id, job.id);
    assert.ok(require('fs').existsSync(row.source_path));
    assert.strictEqual((await h.api('DELETE', `/api/projects/${project.id}`, { token: user.token })).status, 204);
    assert.strictEqual((await h.api('GET', `/api/jobs/${job.id}`, { token: user.token })).status, 404);
    assert.ok(!require('fs').existsSync(row.source_path), 'image removed from disk');
    const leftovers = await h.db.query('select (select count(*) from app.job_results)::int as r, (select count(*) from app.artifacts)::int as a');
    assert.deepStrictEqual(leftovers.rows[0], { r: 0, a: 0 });
  } finally { await h.close(); }
});

test('jobs left running by a crash are failed at boot, not left spinning', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    const project = await h.repos.projects.create(user.id, 'P');
    const { job } = await h.repos.jobs.create(user.id, { projectId: project.id, sourceFilename: 'a.png', sourceMime: 'image/png', sourceBytes: 1, sourceSha256: 'b'.repeat(64) });
    await h.repos.jobs.updateInternal(job.id, { status: 'running' });
    const ids = await h.repos.jobs.failInterruptedInternal();
    assert.deepStrictEqual(ids, [job.id]);
    const after = await h.repos.jobs.get(user.id, job.id);
    assert.strictEqual(after.status, 'failed');
    assert.strictEqual(after.error_code, 'interrupted');
  } finally { await h.close(); }
});

test('rate limiting: job creation is limited per user per minute', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    const project = (await h.api('POST', '/api/projects', { token: user.token, body: { name: 'P' } })).body.project;
    const statuses = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await h.api('POST', `/api/projects/${project.id}/jobs`, { token: user.token, form: new FormData() })).status);
    assert.deepStrictEqual(statuses.slice(0, 10), Array(10).fill(400));
    assert.strictEqual(statuses[10], 429);
  } finally { await h.close(); }
});

test('CORS allowlist and security headers', async () => {
  const h = await setup();
  try {
    const allowed = await fetch(`${h.base}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
    assert.strictEqual(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const denied = await fetch(`${h.base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.strictEqual(denied.headers.get('access-control-allow-origin'), null);
    assert.strictEqual(denied.headers.get('x-powered-by'), null);
    assert.match(denied.headers.get('content-security-policy'), /default-src 'none'/);
    assert.strictEqual(denied.headers.get('x-content-type-options'), 'nosniff');
    const preflight = await fetch(`${h.base}/api/projects`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.strictEqual(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    assert.strictEqual(preflight.headers.get('access-control-allow-credentials'), null, 'no credentialed CORS');
  } finally { await h.close(); }
});

test('project validation and pagination', async () => {
  const h = await setup();
  try {
    const user = await h.createUser();
    for (const name of ['', '   ', 'x'.repeat(121), 42, null]) {
      assert.strictEqual((await h.api('POST', '/api/projects', { token: user.token, body: { name } })).status, 422, JSON.stringify(name));
    }
    for (let i = 0; i < 5; i += 1) await h.api('POST', '/api/projects', { token: user.token, body: { name: `P${i}` } });
    const page1 = await h.api('GET', '/api/projects?limit=2', { token: user.token });
    const page2 = await h.api('GET', `/api/projects?limit=2&cursor=${page1.body.nextCursor}`, { token: user.token });
    const page3 = await h.api('GET', `/api/projects?limit=2&cursor=${page2.body.nextCursor}`, { token: user.token });
    const names = [...page1.body.projects, ...page2.body.projects, ...page3.body.projects].map((p) => p.name);
    assert.deepStrictEqual(names.sort(), ['P0', 'P1', 'P2', 'P3', 'P4']);
    assert.strictEqual(page3.body.nextCursor, null);
    const bad = await h.api('POST', '/api/projects', { token: user.token, body: '{"name":', headers: {} });
    assert.ok([400, 422].includes(bad.status));
  } finally { await h.close(); }
});
