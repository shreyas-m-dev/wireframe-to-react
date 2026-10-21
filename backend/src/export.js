'use strict';

/**
 * Builds a downloadable, runnable Vite + React + Tailwind project around the
 * generated component, as an uncompressed (stored) ZIP. No zip dependency:
 * the format for stored entries is small and fully specified (APPNOTE 4.3).
 */

function crc32(buffer) {
  let c = 0xffffffff;
  for (const b of buffer) {
    c ^= b;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

const UTF8_FLAG = 0x0800;

function zip(files) {
  let offset = 0;
  const locals = [];
  const central = [];
  for (const [name, value] of Object.entries(files)) {
    const n = Buffer.from(name, 'utf8');
    const data = Buffer.from(value, 'utf8');
    const crc = crc32(data);
    const header = [u16(20), u16(UTF8_FLAG), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(n.length)];
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), ...header, u16(0), n, data]);
    locals.push(local);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), u16(20), ...header, u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), n]));
    offset += local.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(central.length), u16(central.length), u32(dir.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, dir, end]);
}

function projectFiles(component) {
  return {
    'package.json': `${JSON.stringify({
      name: 'generated-wireframe-app',
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { '@vitejs/plugin-react': '^4.3.1', vite: '^5.4.8', tailwindcss: '^3.4.13', postcss: '^8.4.47', autoprefixer: '^10.4.20' },
    }, null, 2)}\n`,
    'index.html': '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Generated app</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
    'vite.config.js': "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n",
    'tailwind.config.js': "export default {\n  content: ['./index.html', './src/**/*.{js,jsx}'],\n  theme: { extend: {} },\n  plugins: [],\n};\n",
    'postcss.config.js': 'export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n',
    'src/index.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
    'src/Icon.jsx': "import React from 'react';\n\n// Placeholder used by generated code for detected icons. Replace with your icon set.\nexport default function Icon({ name, className = '' }) {\n  return <span aria-hidden=\"true\" title={name} className={`inline-block h-4 w-4 rounded bg-current opacity-30 ${className}`} />;\n}\n",
    'src/main.jsx': "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport GeneratedComponent from './GeneratedComponent.jsx';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <GeneratedComponent />\n  </React.StrictMode>,\n);\n",
    'src/GeneratedComponent.jsx': /\bIcon\b/.test(component) && !/import\s+Icon\b/.test(component)
      ? component.replace(/(import React[^\n]*\n)/, "$1import Icon from './Icon.jsx';\n")
      : component,
    'README.md': '# Generated React app\n\nProduced by Wireframe → React from an uploaded wireframe.\n\n```bash\nnpm install\nnpm run dev\n```\n\n`src/GeneratedComponent.jsx` is the generated component. Generation is structural, not pixel-perfect: review spacing, copy and imagery before shipping.\n',
  };
}

function createProjectZip(component) {
  return zip(projectFiles(String(component || '')));
}

module.exports = { createProjectZip, projectFiles, crc32 };
