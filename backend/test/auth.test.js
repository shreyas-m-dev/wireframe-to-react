'use strict';

// Authentication: every way a request can fail to prove a live, confirmed,
// end-user session must end in 401 — and no protected route may be reachable.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { generateKeyPair, SignJWT } = require('jose');
const { setup, ADMIN_ID } = require('./helpers');

const PROTECTED = [
  ['GET', '/api/me'], ['GET', '/api/projects'], ['POST', '/api/projects'],
  ['GET', `/api/projects/${crypto.randomUUID()}`], ['PATCH', `/api/projects/${crypto.randomUUID()}`], ['DELETE', `/api/projects/${crypto.randomUUID()}`],
  ['GET', `/api/projects/${crypto.randomUUID()}/jobs`], ['POST', `/api/projects/${crypto.randomUUID()}/jobs`],
  ['GET', `/api/jobs/${crypto.randomUUID()}`], ['GET', `/api/jobs/${crypto.randomUUID()}/result`], ['GET', `/api/jobs/${crypto.randomUUID()}/source`],
  ['GET', `/api/jobs/${crypto.randomUUID()}/export`], ['POST', `/api/jobs/${crypto.randomUUID()}/cancel`], ['POST', `/api/jobs/${crypto.randomUUID()}/regenerate`],
  ['DELETE', `/api/jobs/${crypto.randomUUID()}`], ['GET', '/api/vision/status'], ['POST', '/api/vision/smoke-test'], ['GET', '/api/vision/gemini/models'],
  ['GET', '/api/does-not-exist'],
];

let h;
test.before(async () => { h = await setup(); });
test.after(async () => { await h.close(); });

test('health and readiness are public and minimal', async () => {
  const health = await h.api('GET', '/api/health');
  assert.strictEqual(health.status, 200);
  assert.deepStrictEqual(health.body, { status: 'ok' });
  const ready = await h.api('GET', '/api/ready');
  assert.strictEqual(ready.status, 200);
});

test('every protected route rejects requests without a token', async () => {
  for (const [method, route] of PROTECTED) {
    const res = await h.api(method, route);
    assert.strictEqual(res.status, 401, `${method} ${route} returned ${res.status}`);
    assert.strictEqual(res.body.error.code, 'unauthenticated');
    assert.match(res.headers.get('www-authenticate') || '', /^Bearer/);
  }
});

test('malformed authorization headers are rejected', async () => {
  for (const header of ['Bearer', 'Bearer not-a-jwt', 'Basic dXNlcjpwYXNz', 'bearer a.b.c', `Bearer ${'a'.repeat(9000)}.b.c`]) {
    const res = await h.api('GET', '/api/me', { headers: { Authorization: header } });
    assert.strictEqual(res.status, 401, header.slice(0, 30));
  }
});

test('a valid token for a live session is accepted', async () => {
  const user = await h.createUser();
  const res = await h.api('GET', '/api/me', { token: user.token });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.id, user.id);
  assert.strictEqual(res.body.isAdmin, false);
});

test('expired tokens are rejected with session_expired', async () => {
  const user = await h.createUser();
  const expired = await h.mint({ sub: user.id, sessionId: user.sessionId, expiresIn: Math.floor(Date.now() / 1000) - 60 });
  const res = await h.api('GET', '/api/me', { token: expired });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'session_expired');
});

test('forged or mis-scoped tokens are rejected', async () => {
  const user = await h.createUser();
  const { privateKey: otherKey } = await generateKeyPair('ES256');
  const cases = {
    'signed by an unknown key': await h.mint({ sub: user.id, sessionId: user.sessionId, key: otherKey }),
    'wrong issuer': await h.mint({ sub: user.id, sessionId: user.sessionId, iss: 'https://evil.supabase.co/auth/v1' }),
    'wrong audience': await h.mint({ sub: user.id, sessionId: user.sessionId, aud: 'service' }),
    'service_role key': await h.mint({ sub: user.id, sessionId: user.sessionId, role: 'service_role' }),
    'anon role': await h.mint({ sub: user.id, sessionId: user.sessionId, role: 'anon' }),
    'anonymous user': await h.mint({ sub: user.id, sessionId: user.sessionId, extra: { is_anonymous: true } }),
    'non-uuid subject': await h.mint({ sub: 'admin', sessionId: user.sessionId }),
    'HS256 algorithm confusion': await new SignJWT({ role: 'authenticated', session_id: user.sessionId })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer(h.config.supabaseUrl + '/auth/v1').setAudience('authenticated').setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode('guessable-secret-guessable-secret')),
  };
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', aud: 'authenticated', iss: h.config.supabaseUrl + '/auth/v1', session_id: user.sessionId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  cases['unsigned alg=none'] = `${header}.${payload}.`;
  for (const [name, token] of Object.entries(cases)) {
    const res = await h.api('GET', '/api/me', { token });
    assert.strictEqual(res.status, 401, `${name} returned ${res.status}`);
  }
});

test('signed-out (revoked) sessions are rejected before the token expires', async () => {
  const user = await h.createUser();
  assert.strictEqual((await h.api('GET', '/api/me', { token: user.token })).status, 200);
  await h.db.query('delete from auth.sessions where id = $1', [user.sessionId]); // what Supabase signOut does
  const res = await h.api('GET', '/api/me', { token: user.token });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'session_revoked');
});

test('tokens without a session id, or for a session belonging to another user, are rejected', async () => {
  const alice = await h.createUser();
  const bob = await h.createUser();
  const noSession = await h.mint({ sub: alice.id, sessionId: undefined });
  assert.strictEqual((await h.api('GET', '/api/me', { token: noSession })).status, 401);
  const swapped = await h.mint({ sub: alice.id, sessionId: bob.sessionId });
  assert.strictEqual((await h.api('GET', '/api/me', { token: swapped })).status, 401);
});

test('banned, unconfirmed and deleted users are rejected even with a valid signature', async () => {
  const banned = await h.createUser({ banned: true });
  assert.strictEqual((await h.api('GET', '/api/me', { token: banned.token })).status, 401);
  const unconfirmed = await h.createUser({ confirmed: false });
  assert.strictEqual((await h.api('GET', '/api/me', { token: unconfirmed.token })).status, 401);
  const deleted = await h.createUser();
  await h.db.query('update auth.users set deleted_at = now() where id = $1', [deleted.id]);
  assert.strictEqual((await h.api('GET', '/api/me', { token: deleted.token })).status, 401);
});

test('privilege escalation: admin-only routes refuse ordinary users, and claims in the body are ignored', async () => {
  const user = await h.createUser();
  for (const [method, route] of [['GET', '/api/vision/status'], ['POST', '/api/vision/smoke-test'], ['GET', '/api/vision/gemini/models']]) {
    const res = await h.api(method, route, { token: user.token });
    assert.strictEqual(res.status, 403, `${method} ${route}`);
  }
  // A token claiming admin-ish metadata does not grant admin: only ADMIN_USER_IDS does.
  const claims = await h.mint({ sub: user.id, sessionId: user.sessionId, extra: { app_metadata: { role: 'admin' }, user_role: 'admin' } });
  assert.strictEqual((await h.api('GET', '/api/vision/status', { token: claims })).status, 403);

  const admin = await h.createUser({ id: ADMIN_ID });
  const status = await h.api('GET', '/api/vision/status', { token: admin.token });
  assert.strictEqual(status.status, 200);
  assert.strictEqual(typeof status.body.apiKeyConfigured, 'boolean');
  assert.ok(!JSON.stringify(status.body).match(/key"\s*:\s*"[^"]{8,}/i), 'status never echoes key material');
});
