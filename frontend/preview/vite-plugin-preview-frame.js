/**
 * Builds /preview-frame.html: a self-contained page that hosts generated
 * components inside the sandboxed preview iframe.
 *
 * Everything is inlined — React and ReactDOM production UMD builds from
 * node_modules (version-locked by package-lock, no CDN), the frame runtime,
 * and a Tailwind stylesheet compiled for the class vocabulary the code
 * generator emits — so the frame needs no network access at all, and its CSP
 * can forbid every fetch, form and connection.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
// Tailwind's content globs need forward slashes, including on Windows.
const glob = (...parts) => path.join(...parts).split(path.sep).join('/');

export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'", // opaque-origin sandbox: evaluation is the point, exfiltration is blocked below
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "media-src 'none'",
  "object-src 'none'",
].join('; ');

// The generator builds some class names dynamically (e.g. bg-{color}-600), so
// they can't be found by scanning sources; these patterns cover that range.
const SAFELIST = [
  { pattern: /^(bg|text|border)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/, variants: ['hover', 'md', 'lg'] },
  { pattern: /^(bg|text|border)-(white|black|transparent)$/ },
  { pattern: /^grid-cols-(1|2|3|4|5|6|12)$/, variants: ['sm', 'md', 'lg'] },
  { pattern: /^gap-(1|2|3|4|5|6|8|10|12|16|20|24)$/ },
  { pattern: /^(p|px|py|m|mx|my)-(0|1|2|3|4|5|6|8|10|12|16|20|24)$/, variants: ['md'] },
  { pattern: /^space-y-(0|1|2|3|4|5|6|8|10|12|16|20|24)$/ },
  { pattern: /^rounded-(none|sm|md|lg|xl|2xl|3xl|full)$/ },
  { pattern: /^max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|full|screen)$/ },
  { pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/, variants: ['md'] },
  { pattern: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/ },
  { pattern: /^shadow-(none|sm|md|lg|xl|2xl)$/ },
];

async function previewCss() {
  const config = {
    content: [
      glob(repoRoot, 'services/codegen/**/*.py'),
      glob(repoRoot, 'services/semantic/**/*.js'),
      glob(repoRoot, 'services/rag/seed_templates/*.json'),
      glob(here, 'frame-runtime.js'),
    ],
    safelist: SAFELIST,
    theme: { extend: {} },
    plugins: [],
  };
  const result = await postcss([tailwindcss(config)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;\nhtml,body{margin:0;background:#fff;}', { from: undefined });
  return result.css;
}

function inlineScript(source) {
  // Prevent a literal "</script" inside a bundle from closing the tag early.
  return `<script>${source.replace(/<\/script/gi, '<\\/script')}</script>`;
}

export async function buildPreviewFrameHtml() {
  // UMD files aren't in the packages' "exports" map, so resolve the package root.
  const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
  const react = fs.readFileSync(path.join(pkgDir('react'), 'umd/react.production.min.js'), 'utf8');
  const reactDom = fs.readFileSync(path.join(pkgDir('react-dom'), 'umd/react-dom.production.min.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(here, 'frame-runtime.js'), 'utf8');
  const css = await previewCss();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>Generated preview</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
${inlineScript(react)}
${inlineScript(reactDom)}
${inlineScript(runtime)}
</body>
</html>
`;
}

export default function previewFramePlugin() {
  let cached = null;
  const html = () => (cached ||= buildPreviewFrameHtml());
  return {
    name: 'w2r-preview-frame',
    configureServer(server) {
      html().catch((error) => server.config.logger.error(`[preview-frame] ${error.message}`)); // warm: first build compiles Tailwind
      server.watcher.add(path.join(here, 'frame-runtime.js'));
      server.watcher.on('change', (file) => { if (file.endsWith('frame-runtime.js')) cached = null; });
      server.middlewares.use('/preview-frame.html', async (_req, res, next) => {
        try {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(await html());
        } catch (error) { next(error); }
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'preview-frame.html', source: await html() });
    },
  };
}
