import test from 'node:test';
import assert from 'node:assert';
import { ApiError, createApiClient, describeError } from '../src/lib/api.js';
import { isSafeInternalPath, matchRoute, workspacePath } from '../src/lib/router.js';

function response(status, body, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

test('attaches the bearer token and returns JSON', async () => {
  const calls = [];
  const api = createApiClient({ getAccessToken: async () => 'tok-1', refreshSession: async () => null, fetchImpl: async (url, init) => { calls.push({ url, init }); return response(200, { ok: true }); } });
  assert.deepStrictEqual(await api('/api/me'), { ok: true });
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer tok-1');
});

test('an expired session is refreshed once and the request retried', async () => {
  const seen = [];
  let unauthenticated = 0;
  const api = createApiClient({
    getAccessToken: async () => 'old',
    refreshSession: async () => 'new',
    onUnauthenticated: () => { unauthenticated += 1; },
    fetchImpl: async (_url, init) => {
      seen.push(init.headers.Authorization);
      return init.headers.Authorization === 'Bearer old' ? response(401, { error: { code: 'session_expired', message: 'expired' } }) : response(200, { ok: 1 });
    },
  });
  assert.deepStrictEqual(await api('/api/projects'), { ok: 1 });
  assert.deepStrictEqual(seen, ['Bearer old', 'Bearer new']);
  assert.strictEqual(unauthenticated, 0);
});

test('a revoked session signs the user out without retrying', async () => {
  let refreshes = 0;
  let signedOut = null;
  const api = createApiClient({
    getAccessToken: async () => 'tok',
    refreshSession: async () => { refreshes += 1; return 'tok2'; },
    onUnauthenticated: (code) => { signedOut = code; },
    fetchImpl: async () => response(401, { error: { code: 'session_revoked', message: 'ended' } }),
  });
  await assert.rejects(api('/api/me'), (error) => error instanceof ApiError && error.code === 'session_revoked');
  assert.strictEqual(refreshes, 0);
  assert.strictEqual(signedOut, 'session_revoked');
});

test('errors carry code, request id and Retry-After; network failures are typed', async () => {
  const api = createApiClient({ getAccessToken: async () => 't', refreshSession: async () => null, fetchImpl: async () => response(429, { error: { code: 'too_many_active_jobs', message: 'Wait.', requestId: 'req-1' } }, { 'retry-after': '30' }) });
  await assert.rejects(api('/x'), (error) => error.status === 429 && error.code === 'too_many_active_jobs' && error.retryAfter === 30 && error.requestId === 'req-1');
  const offline = createApiClient({ getAccessToken: async () => 't', refreshSession: async () => null, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline('/x'), (error) => error.code === 'network_error' && /connection/.test(error.message));
  const html502 = createApiClient({ getAccessToken: async () => 't', refreshSession: async () => null, fetchImpl: async () => ({ ok: false, status: 502, headers: new Headers(), json: async () => { throw new SyntaxError('html'); } }) });
  await assert.rejects(html502('/x'), (error) => error.status === 502 && /server had a problem/.test(error.message));
  assert.match(describeError(new ApiError(500, 'internal_error', 'Something went wrong.', { requestId: 'abc' })), /reference abc/);
  assert.strictEqual(describeError(new Error('Traceback /srv/secret')), 'Something went wrong. Try again.', 'non-API errors never echo internals');
});

test('router matches known routes and rejects unknown ones', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepStrictEqual(matchRoute('/app'), { name: 'workspace', params: {} });
  assert.deepStrictEqual(matchRoute(`/app/p/${id}/j/${id}`), { name: 'workspace', params: { projectId: id, jobId: id } });
  assert.strictEqual(matchRoute('/app/p/not-a-uuid').name, 'notFound');
  assert.strictEqual(matchRoute('/login').name, 'login');
  assert.strictEqual(workspacePath(id), `/app/p/${id}`);
});

test('navigation only accepts same-app paths (no open redirects)', () => {
  for (const bad of ['//evil.example', 'https://evil.example', 'javascript:alert(1)', '/\\evil.example', '/javascript:alert(1)', '', null]) {
    assert.strictEqual(isSafeInternalPath(bad), false, String(bad));
  }
  assert.strictEqual(isSafeInternalPath('/app/p/x'), true);
});
