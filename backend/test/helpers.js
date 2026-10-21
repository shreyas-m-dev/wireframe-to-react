'use strict';

/**
 * Test harness: real Postgres (PGlite) with real migrations, real JWT
 * verification against a locally generated ES256 key set, and an injectable
 * fake pipeline so API behaviour is tested without spawning Python.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } = require('jose');
const { loadConfig } = require('../src/config');
const { createPgliteDatabase } = require('../src/db');
const { migrateUp } = require('../src/db/migrate');
const { createRepositories } = require('../src/db/repositories');
const { createTokenVerifier, createSessionChecker } = require('../src/auth/supabase');
const { JobRunner } = require('../src/jobs/runner');
const { createBlobStore } = require('../src/uploads');
const { createApp } = require('../src/app');
const { createLogger } = require('../src/logger');

const SUPABASE_URL = 'https://unit-test-project.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Smallest valid PNG (1×1) — magic bytes are what the upload check reads.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

const SAMPLE_JSX = 'import React, { useState } from "react";\n\nexport default function GeneratedComponent() {\n  const [open, setOpen] = useState(false);\n  return (\n    <div data-wireframe-id="root-0">\n      <button onClick={() => setOpen(!open)}>Toggle</button>\n    </div>\n  );\n}\n';

function fakeResult(overrides = {}) {
  const code = SAMPLE_JSX;
  return {
    status: 'complete', errorCode: null, errorMessage: null, genMode: 'template', schemaSource: 'local-cv-ocr',
    detections: [{ type: 'button', x: 1, y: 1, width: 10, height: 5, confidence: 0.9 }],
    detectionMeta: { canvas: { width: 100, height: 100 }, category: 'generic' },
    schema: { type: 'root', id: 'root-0', children: [] },
    validation: { valid: true, overallStatus: 'ready' },
    templates: [], recognizedInstructions: [],
    artifacts: [
      { kind: 'jsx', content: code, sha256: crypto.createHash('sha256').update(code).digest('hex'), byteLength: Buffer.byteLength(code) },
      { kind: 'preview-js', content: 'function GeneratedComponent(){return null}', sha256: 'a'.repeat(64), byteLength: 40, meta: { componentName: 'GeneratedComponent' } },
    ],
    ...overrides,
  };
}

async function createKeys() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  return { privateKey, keySet: createLocalJWKSet({ keys: [jwk] }) };
}

async function setup({ pipeline, env = {}, sessionCheck = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2r-test-'));
  const config = loadConfig({
    NODE_ENV: 'test', SUPABASE_URL, DATABASE_URL: 'postgres://unused/unused', DATABASE_SSL: 'disable',
    DATA_DIR: dataDir, ADMIN_USER_IDS: ADMIN_ID, CORS_ORIGINS: 'http://localhost:5173', AUTH_SESSION_CACHE_MS: '0', ...env,
  });
  const db = await createPgliteDatabase();
  await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/supabase_auth_stub.sql'), 'utf8'));
  await migrateUp(db);
  const repos = createRepositories(db);
  const logs = [];
  const logger = createLogger({ level: 'debug', write: (line) => logs.push(JSON.parse(line)) });
  const keys = await createKeys();
  const runner = new JobRunner({
    repos, logger, maxConcurrent: Number(env.MAX_CONCURRENT_JOBS || 2), maxQueued: Number(env.MAX_QUEUED_JOBS || 20), stageTimeoutMs: 10_000,
    runPipeline: pipeline || (async (_job, { onStage }) => { await onStage('generate'); return fakeResult(); }),
  });
  const app = createApp({
    config, db, repos, runner, logger,
    blobs: createBlobStore(config.dataDir),
    verifyAccessToken: createTokenVerifier({ supabaseUrl: SUPABASE_URL, keySet: keys.keySet }),
    assertSessionActive: sessionCheck ? createSessionChecker(db, { cacheMs: 0 }) : null,
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function createUser({ id = crypto.randomUUID(), confirmed = true, banned = false } = {}) {
    const sessionId = crypto.randomUUID();
    await db.query('insert into auth.users (id, email, email_confirmed_at, banned_until) values ($1, $2, $3, $4)', [
      id, `${id.slice(0, 8)}@example.test`, confirmed ? new Date().toISOString() : null, banned ? new Date(Date.now() + 86_400_000).toISOString() : null,
    ]);
    await db.query('insert into auth.sessions (id, user_id) values ($1, $2)', [sessionId, id]);
    const token = await mint({ sub: id, sessionId });
    return { id, sessionId, token };
  }

  function mint({ sub, sessionId, role = 'authenticated', aud = 'authenticated', iss = ISSUER, expiresIn = '10m', key = keys.privateKey, extra = {} }) {
    const jwt = new SignJWT({ role, session_id: sessionId, email: `${String(sub).slice(0, 8)}@example.test`, aal: 'aal1', ...extra })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
      .setSubject(sub).setIssuer(iss).setAudience(aud).setIssuedAt();
    if (typeof expiresIn === 'number') jwt.setExpirationTime(expiresIn);
    else jwt.setExpirationTime(expiresIn);
    return jwt.sign(key);
  }

  async function api(method, route, { token, body, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (form) init.body = form;
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(`${base}${route}`, init);
    const type = res.headers.get('content-type') || '';
    const payload = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: payload };
  }

  function upload(buffer = PNG, filename = 'wire.png', instructions) {
    const form = new FormData();
    form.append('wireframe', new Blob([buffer]), filename);
    if (instructions !== undefined) form.append('instructions', instructions);
    return form;
  }

  async function close() {
    await runner.shutdown(2_000);
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { config, db, repos, runner, logs, keys, base, api, mint, upload, createUser, close };
}

module.exports = { setup, fakeResult, PNG, SAMPLE_JSX, ADMIN_ID, ISSUER, SUPABASE_URL };
