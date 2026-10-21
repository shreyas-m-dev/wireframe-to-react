// Real-browser test of the preview sandbox: serves the built
// dist/preview-frame.html, embeds it exactly as SandboxedPreview does
// (sandbox="allow-scripts", no allow-same-origin) and checks that:
//   1. real generated code renders inside it;
//   2. hostile code cannot reach the parent's DOM, storage or cookies, or the network;
//   3. a busy loop in generated code does not block the parent page.
// Needs a local Chrome/Edge (CHROME_PATH or default install paths) and a
// prior `npm run build`; otherwise the tests are reported as skipped.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const repo = path.resolve(here, '../..');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
const built = fs.existsSync(path.join(dist, 'preview-frame.html'));
const skip = !executablePath ? 'no local Chrome/Edge (set CHROME_PATH)' : !built ? 'run `npm run build` first' : false;

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>Parent page</title></head><body>
<p id="secret">parent-secret-dom</p>
<script>
  localStorage.setItem('sb-auth-token', 'PARENT-SESSION-TOKEN');
  document.cookie = 'parent_cookie=PARENT-COOKIE';
  window.renderInFrame = (js, componentName, waitFor = ['rendered', 'error'], timeoutMs = 8000) => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = 'width:900px;height:600px';
    frame.src = '/preview-frame.html';
    const nonce = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    window.addEventListener('message', function onMessage(e) {
      if (e.source !== frame.contentWindow || !e.data || e.data.source !== 'w2r-preview') return;
      if (e.data.type === 'ready') frame.contentWindow.postMessage({ type: 'render', nonce, js, componentName }, '*');
      if (e.data.nonce !== nonce) return;
      if (waitFor.includes(e.data.type)) { clearTimeout(timer); window.removeEventListener('message', onMessage); resolve(e.data); }
    });
    document.body.appendChild(frame);
  });
</script></body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    serverHits.push(url.pathname + url.search);
    if (url.pathname === '/harness.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
    if (url.pathname === '/preview-frame.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "frame-ancestors 'self'" });
      res.end(fs.readFileSync(path.join(dist, 'preview-frame.html')));
      return;
    }
    if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"leak":true}'); return; }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let browser; let server; let base;
const serverHits = [];
test.before(async () => {
  if (skip) return;
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath, headless: true });
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await browser?.close(); server?.close(); });

test('real generated code renders inside the sandbox', { skip }, async () => {
  const { compilePreview } = require(path.join(repo, 'backend/src/pipeline/compile.js'));
  const source = fs.readFileSync(path.join(repo, 'services/fixtures/outputs/login-form/generated.jsx'), 'utf8');
  const { js, componentName } = compilePreview(source);
  const page = await browser.newPage();
  await page.goto(`${base}/harness.html`);
  const result = await page.evaluate(([code, name]) => window.renderInFrame(code, name), [js, componentName]);
  assert.strictEqual(result.type, 'rendered', JSON.stringify(result));
  const frame = page.frames().find((f) => f.url().endsWith('/preview-frame.html'));
  await frame.waitForFunction(() => document.querySelector('#root').children.length > 0);
  const html = await frame.evaluate(() => document.querySelector('#root').innerHTML);
  assert.match(html, /data-wireframe-id="root-0"/, 'generated tree is in the frame DOM');
  const styled = await frame.evaluate(() => getComputedStyle(document.querySelector('#root *')).display);
  assert.ok(styled, 'Tailwind stylesheet is applied inside the frame');
  await page.close();
});

test('hostile generated code cannot reach the parent page, storage, cookies or network', { skip }, async () => {
  const probe = `function GeneratedComponent(){
    const [s, setS] = useState(null);
    useEffect(() => {
      const out = {};
      try { out.parentDom = window.parent.document.getElementById('secret').textContent; } catch (e) { out.parentDom = 'blocked'; }
      try { out.parentStorage = window.parent.localStorage.getItem('sb-auth-token'); } catch (e) { out.parentStorage = 'blocked'; }
      try { out.ownStorage = String(localStorage.getItem('sb-auth-token')); } catch (e) { out.ownStorage = 'blocked'; }
      try { out.cookie = document.cookie; } catch (e) { out.cookie = 'blocked'; }
      out.origin = window.origin;
      fetch('/api/health').then((r) => r.text()).then((t) => { out.fetch = t; }, () => { out.fetch = 'blocked'; })
        .finally(() => { const img = new Image(); img.src = '/api/health?beacon=1'; setS(JSON.stringify(out)); });
    }, []);
    if (s) throw new Error('PROBE ' + s);
    return React.createElement('p', null, 'probing');
  }`;
  const page = await browser.newPage();
  const failed = [];
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  serverHits.length = 0;
  await page.goto(`${base}/harness.html`);
  const result = await page.evaluate((code) => window.renderInFrame(code, 'GeneratedComponent', ['error']), probe);
  assert.strictEqual(result.type, 'error', JSON.stringify(result));
  const report = JSON.parse(result.message.replace(/^PROBE /, ''));
  assert.deepStrictEqual(report, { parentDom: 'blocked', parentStorage: 'blocked', ownStorage: 'blocked', cookie: 'blocked', origin: 'null', fetch: 'blocked' });
  await page.waitForTimeout(500);
  // Ground truth is the server: nothing the frame attempted (fetch, image beacon) arrived.
  assert.ok(!serverHits.some((u) => u.startsWith('/api/health')), `requests reached the server: ${serverHits.join(', ')}`);
  console.log('# blocked in browser:', failed.join(' ; ') || '(none reported)');
  assert.strictEqual(await page.evaluate(() => document.title), 'Parent page', 'parent was not navigated');
  await page.close();
});

test('a busy loop in generated code does not freeze the parent page', { skip }, async () => {
  const busy = 'function GeneratedComponent(){ const end = Date.now() + 2500; while (Date.now() < end) {} return React.createElement("p", null, "done"); }';
  const page = await browser.newPage();
  await page.goto(`${base}/harness.html`);
  const drift = await page.evaluate(async (code) => {
    window.renderInFrame(code, 'GeneratedComponent');
    await new Promise((r) => setTimeout(r, 300)); // let the frame start its loop
    const started = performance.now();
    await new Promise((r) => setTimeout(r, 100));
    return performance.now() - started;
  }, busy);
  // Same-thread frames would delay this 100 ms timer by ~2.5 s.
  assert.ok(drift < 1000, `parent timer drifted ${Math.round(drift)} ms; the frame shares the parent's thread`);
  await page.close();
});
