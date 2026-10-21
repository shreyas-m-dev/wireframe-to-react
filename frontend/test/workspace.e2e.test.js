// End-to-end: real frontend (Vite dev server) + real backend app + real
// Python pipeline + real Postgres (PGlite) + the real token verifier, in
// headless Chrome. Supabase itself is the only stand-in: the session is a JWT
// signed by a locally generated key that the backend is configured to trust,
// and auth.users/auth.sessions come from the test stub schema.
//
// Flow: signed-in user → create project → upload wireframe → generate →
// progress → sandboxed preview renders → keyboard tabs → export .zip →
// sign out → protected route redirects to sign-in.
//
// Skipped (visibly) without a local Chrome/Edge or the project's Python venv.
import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const r = (p) => require(path.join(repo, p));

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean).find((p) => fs.existsSync(p));
const python = process.env.PYTHON_BIN || [path.join(repo, '.venv/Scripts/python.exe'), path.join(repo, '.venv/bin/python')].find((p) => fs.existsSync(p));
const skip = !chrome ? 'no local Chrome/Edge (set CHROME_PATH)' : !python ? 'no Python venv (set PYTHON_BIN)' : false;

const SUPABASE = 'http://127.0.0.1:9'; // never contacted: the session is pre-seeded
const API_PORT = 3998;
const WEB_PORT = 5179;

test('signed-in user generates React from a wireframe and exports it', { skip, timeout: 300_000 }, async () => {
  Object.assign(process.env, { PYTHON_BIN: python, VISION_ENABLED: 'false', VISION_PROVIDER: 'disabled', GEN_MODE: 'template' });
  const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } = r('node_modules/jose');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2r-e2e-'));
  const config = r('backend/src/config').loadConfig({ NODE_ENV: 'test', SUPABASE_URL: SUPABASE, DATABASE_URL: 'postgres://unused/x', DATABASE_SSL: 'disable', DATA_DIR: dataDir, CORS_ORIGINS: `http://localhost:${WEB_PORT}`, AUTH_SESSION_CACHE_MS: '0' });
  const db = await r('backend/src/db').createPgliteDatabase();
  await db.exec(fs.readFileSync(path.join(repo, 'backend/test/fixtures/supabase_auth_stub.sql'), 'utf8'));
  await r('backend/src/db/migrate').migrateUp(db);
  const repos = r('backend/src/db/repositories').createRepositories(db);
  const logger = r('backend/src/logger').createLogger({ level: 'silent' });
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const auth = r('backend/src/auth/supabase');
  const runner = new (r('backend/src/jobs/runner').JobRunner)({ repos, logger, runPipeline: r('backend/src/pipeline/pipeline').runPipeline, stageTimeoutMs: 180_000 });
  const app = r('backend/src/app').createApp({
    config, db, repos, runner, logger, blobs: r('backend/src/uploads').createBlobStore(dataDir),
    verifyAccessToken: auth.createTokenVerifier({ supabaseUrl: SUPABASE, keySet: createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'e2e', alg: 'ES256' }] }) }),
    assertSessionActive: auth.createSessionChecker(db, { cacheMs: 0 }),
  });
  const server = await new Promise((resolve) => { const s = app.listen(API_PORT, '127.0.0.1', () => resolve(s)); });

  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'e2e@example.test', now())", [userId]);
  await db.query('insert into auth.sessions (id, user_id) values ($1, $2)', [sessionId, userId]);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await new SignJWT({ role: 'authenticated', session_id: sessionId, email: 'e2e@example.test' })
    .setProtectedHeader({ alg: 'ES256', kid: 'e2e' }).setSubject(userId).setIssuer(`${SUPABASE}/auth/v1`).setAudience('authenticated').setIssuedAt().setExpirationTime(exp).sign(privateKey);

  const vite = spawn(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), '--port', String(WEB_PORT), '--strictPort'], {
    cwd: path.join(repo, 'frontend'),
    env: { ...process.env, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'e2e-public-key', VITE_DEV_API_TARGET: `http://127.0.0.1:${API_PORT}` },
    stdio: 'ignore',
  });
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const base = `http://localhost:${WEB_PORT}`;
    for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${base}/login`)).ok) break; } catch { /* starting */ } await new Promise((res) => setTimeout(res, 500)); }

    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // Unauthenticated: the workspace redirects to sign-in.
    await page.goto(`${base}/app`);
    await page.waitForURL(/\/login$/);

    // Seed the session exactly as supabase-js stores it, then enter the app.
    await page.evaluate(([t, uid, e]) => localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: t, token_type: 'bearer', expires_in: 3600, expires_at: e, refresh_token: 'unused',
      user: { id: uid, email: 'e2e@example.test', aud: 'authenticated', role: 'authenticated' },
    })), [token, userId, exp]);
    await page.goto(`${base}/app`);
    await page.getByText('Create your first project').waitFor();

    await page.getByLabel('New project name').fill('E2E project');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/app\/p\/[0-9a-f-]{36}$/);

    await page.setInputFiles('input[type=file]', path.join(repo, 'services/fixtures/uploads/landing-wireframe.jpeg'));
    await page.getByLabel('Design instructions (optional)').fill('Use a dark theme with rounded blue buttons.');
    await page.getByRole('button', { name: 'Generate React' }).click();
    await page.waitForURL(/\/j\/[0-9a-f-]{36}$/);
    await page.getByRole('heading', { name: 'Generating…' }).waitFor();

    // Wait for any terminal state, then assert, so a failure says what happened.
    const progress = page.locator('.area-progress');
    await progress.getByText(/^(Complete|Needs review|Failed|Cancelled)$/).first().waitFor({ timeout: 180_000 });
    const progressText = (await progress.innerText()).replace(/\s+/g, ' ');
    assert.ok(/\bComplete\b/.test(progressText), `job did not complete: ${progressText}`);
    const validation = page.locator('.area-validation');
    assert.strictEqual(await validation.getByText('100%').count(), 1, 'schema coverage is 100%');
    assert.strictEqual(await validation.getByText('Yes', { exact: true }).count(), 1, 'generated code compiles');

    // The sandboxed preview renders the generated component.
    const iframe = page.locator('iframe[title="Generated component preview"]');
    assert.strictEqual(await iframe.getAttribute('sandbox'), 'allow-scripts');
    await page.getByText('Rendering preview…').waitFor({ state: 'detached', timeout: 30_000 });
    const frame = page.frames().find((f) => f.url().endsWith('/preview-frame.html'));
    await frame.waitForFunction(() => document.querySelector('#root [data-wireframe-id]'));

    // If an extension blocks the frame (ERR_BLOCKED_BY_CLIENT, as ad blockers
    // do), the user gets a specific, actionable message, not a vague timeout.
    await page.route('**/preview-frame.html', (route) => route.abort('blockedbyclient'));
    await page.getByRole('button', { name: 'Open preview in full view' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(/blocked/).waitFor({ timeout: 30_000 });
    assert.match(await dialog.innerText(), /extension|Incognito/);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.unroute('**/preview-frame.html');

    // Tabs follow the WAI-ARIA keyboard pattern.
    await page.getByRole('tab', { name: 'Code' }).click();
    await page.keyboard.press('ArrowRight');
    assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), 'Schema');
    await page.getByRole('tab', { name: 'Code' }).click();
    assert.ok(await page.getByText('export default function').first().isVisible());

    // Export downloads a zip of a runnable project.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export \.zip/ }).click();
    const file = await download;
    const zip = fs.readFileSync(await file.path());
    assert.strictEqual(zip.subarray(0, 2).toString(), 'PK');
    assert.ok(zip.includes(Buffer.from('src/GeneratedComponent.jsx')));

    // History lists the run.
    assert.strictEqual(await page.locator('.area-history li').count(), 1);

    // Sign out deletes the session server-side; the old token stops working.
    await db.query('delete from auth.sessions where id = $1', [sessionId]); // what Supabase does on signOut
    const after = await fetch(`http://127.0.0.1:${API_PORT}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(after.status, 401);

    assert.deepStrictEqual(pageErrors, []);
  } finally {
    await browser.close();
    vite.kill();
    await runner.shutdown(2_000);
    await new Promise((res) => server.close(res));
    await db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
