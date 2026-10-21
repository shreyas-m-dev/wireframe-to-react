'use strict';

/**
 * Server-side JSX handling for generated code:
 *  - validateGeneratedJsx: parser gate (does the JSX parse at all?)
 *  - validateDependencyManifest: state/handlers/targets the plan expects exist
 *  - compilePreview: JSX module -> plain JS for the sandboxed preview frame.
 *    Imports are dropped (the frame provides React and hooks) and the default
 *    export becomes a named declaration whose name is returned.
 */

const babel = require('@babel/core');

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function redact(value) {
  return String(value || '').replace(/(?:sk-[A-Za-z0-9_-]+|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+)/gi, '[redacted]').slice(0, 180) || null;
}

function validateGeneratedJsx(code) {
  try {
    babel.parseSync(String(code || ''), { sourceType: 'module', parserOpts: { plugins: ['jsx'] }, babelrc: false, configFile: false });
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: redact(error.message) || 'Generated JSX failed parser validation.' };
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateDependencyManifest(code, manifest = {}) {
  const source = String(code || '');
  const failures = [];
  const declaration = (name) => new RegExp(`\\b(?:const|let)\\s*\\[?${escapeRegExp(name)}\\b`);
  for (const state of manifest.state || []) if (new RegExp(`\\b${escapeRegExp(state)}\\b`).test(source) && !declaration(state).test(source)) failures.push(`undefined state: ${state}`);
  for (const handler of manifest.handlers || []) if (new RegExp(`\\b${escapeRegExp(handler)}\\b`).test(source) && !new RegExp(`(?:const|function)\\s+${escapeRegExp(handler)}\\b`).test(source)) failures.push(`undefined handler: ${handler}`);
  for (const target of manifest.targets || []) if (target && target !== 'cart-summary' && source.includes(`getElementById("${target}")`) && !new RegExp(`id="${escapeRegExp(target)}"`).test(source)) failures.push(`missing navigation target: ${target}`);
  return { valid: failures.length === 0, failures };
}

// Names the preview frame provides to generated code (preview/frame-runtime.js)
// plus standard browser/JS globals. Anything else must be declared in the module.
const PROVIDED = new Set(['React', 'Icon', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useReducer', 'useLayoutEffect', 'useId', 'Fragment']);
const GLOBALS = new Set([
  'window', 'document', 'console', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'fetch', 'alert', 'confirm',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
  'RegExp', 'Error', 'TypeError', 'Intl', 'URL', 'URLSearchParams', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'undefined', 'NaN', 'Infinity', 'globalThis', 'structuredClone', 'crypto',
]);

/**
 * Identifiers the code reads but nothing defines: not declared in the module,
 * not provided by the preview frame, not a known global. Such code parses but
 * throws a ReferenceError when it renders (e.g. "formData is not defined").
 * Imports other than React and its hooks count as undefined too, because the
 * preview strips imports.
 */
function findUndeclaredIdentifiers(code) {
  const ast = babel.parseSync(String(code || ''), { sourceType: 'module', parserOpts: { plugins: ['jsx'] }, babelrc: false, configFile: false });
  const missing = new Set();
  babel.traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (!name || PROVIDED.has(name) || GLOBALS.has(name)) return;
      if (path.isJSXIdentifier() && /^[a-z]/.test(name)) return; // intrinsic element like <div>
      const binding = path.scope.getBinding(name);
      if (binding && binding.kind !== 'module') return;
      missing.add(name);
    },
  });
  return [...missing].sort();
}

function previewModulePlugin({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(path) { path.remove(); },
      ExportNamedDeclaration(path) {
        if (path.node.declaration) path.replaceWith(path.node.declaration);
        else path.remove();
      },
      ExportDefaultDeclaration(path, state) {
        const declaration = path.node.declaration;
        if ((t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) && declaration.id) {
          state.file.metadata.componentName = declaration.id.name;
          path.replaceWith(declaration);
        } else if (t.isIdentifier(declaration)) {
          state.file.metadata.componentName = declaration.name;
          path.remove();
        } else {
          state.file.metadata.componentName = '__GeneratedDefault';
          path.replaceWith(t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__GeneratedDefault'), declaration)]));
        }
      },
    },
  };
}

/** @returns {{ js: string, componentName: string }} */
function compilePreview(code) {
  const result = babel.transformSync(String(code || ''), {
    sourceType: 'module',
    babelrc: false,
    configFile: false,
    compact: false,
    comments: false,
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    plugins: [previewModulePlugin],
  });
  const componentName = result.metadata.componentName;
  if (!componentName || !IDENTIFIER.test(componentName)) throw new Error('Generated code has no default-exported component.');
  return { js: result.code, componentName };
}

module.exports = { validateGeneratedJsx, validateDependencyManifest, compilePreview, findUndeclaredIdentifiers, redact };
