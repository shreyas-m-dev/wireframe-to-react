'use strict';

/**
 * CGDA (Code Generation Discrepancy Auditor) — Pipeline Step 6.
 *
 * Parses generated JSX with @babel/parser and removes every element that the
 * schema cannot account for, before the code reaches validation or preview.
 *
 * An element is accounted for when either:
 *   - it carries `data-wireframe-id`, that id exists in the schema, and its tag
 *     is allowed for that schema node's type/role (provenance check), or
 *   - it carries no id and its tag is in the schema-wide whitelist built from
 *     every node type and role present in the schema (scaffolding check).
 *
 * Stripping edits the original source by character range, so code that needs
 * no filtering is returned byte-for-byte unchanged and formatting is never
 * rewritten. A stripped element takes its whole subtree with it.
 */

const parser = require('@babel/parser');

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Wrappers every generated component may use regardless of schema content.
const ALWAYS_ALLOWED = new Set(['div', 'span', 'Fragment', 'React.Fragment', '']);

// Components the preview runtime provides to generated code.
const RUNTIME_COMPONENTS = new Set(['Icon']);

const CONTAINER_TAGS = ['div', 'section', 'header', 'footer', 'nav', 'main', 'aside', 'article', 'ul', 'ol', 'li', 'form', 'fieldset', 'figure'];
const TEXT_TAGS = ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'strong', 'em', 'small', 'b', 'i', 'li', 'a', 'blockquote', 'legend', 'figcaption'];
const MEDIA_TAGS = ['img', 'figure', 'figcaption', 'picture', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'g', 'div', 'span', 'Icon'];

// The first entry of each list is the canonical tag used by validate.autoCorrect.
const TYPE_TO_ALLOWED_TAGS = {
  root: ['div', 'main', 'section', 'Fragment', 'React.Fragment', ''],
  container: CONTAINER_TAGS,
  region: CONTAINER_TAGS,
  card: ['article', 'div', 'li', 'section'],
  list: ['ul', 'ol', 'li', 'div'],
  text: TEXT_TAGS,
  heading: ['h2', 'h1', 'h3', 'h4', 'h5', 'h6'],
  link: ['a'],
  button: ['button', 'a'],
  input: ['input', 'textarea', 'select', 'option', 'label'],
  checkbox: ['input', 'label'],
  select: ['select', 'option', 'label'],
  textarea: ['textarea', 'label'],
  image: MEDIA_TAGS,
  icon: ['Icon', 'svg', 'path', 'span', 'i'],
};

// Roles that imply a specific landmark or control tag even under a generic type.
const ROLE_TO_TAGS = {
  page: ['main', 'div'],
  'page-root': ['div', 'main'],
  header: ['header', 'nav'],
  nav: ['nav', 'ul', 'li', 'a'],
  'nav-group': ['nav', 'ul', 'li', 'a'],
  // The template compiler renders in-page navigation as buttons that call
  // scrollIntoView (see services/semantic/ui_plan.js resolveInteractions).
  'nav-link': ['a', 'li', 'button'],
  'nav-text': ['a', 'span', 'button'],
  action: ['button', 'a'],
  'primary-action': ['button', 'a'],
  'feature-card': ['article', 'div', 'li', 'section'],
  brand: ['a', 'span', 'strong', 'img'],
  main: ['main'],
  footer: ['footer', 'nav', 'ul', 'li', 'a'],
  form: ['form', 'fieldset', 'label', 'input', 'textarea', 'select', 'option', 'button'],
  // The compiler renders every contact section as a form with an email field
  // and a submit button (services/codegen/template_compiler.py, contact-section).
  'contact-section': ['section', 'form', 'input', 'label', 'button', 'p'],
  sidebar: ['aside', 'nav'],
  logo: ['a', 'img', 'span', 'strong'],
};

// ---------------------------------------------------------------------------
// AST serialisation (typed codegen AST → JSX string). Kept from the previous
// implementation: the compiler can hand CGDA an AST instead of a string.
// ---------------------------------------------------------------------------

function serializeAstToJsx(node, indent = 0, context = { inForm: false }) {
  const pad = '  '.repeat(indent);

  if (!node) return '';
  if (Array.isArray(node)) return node.map(n => serializeAstToJsx(n, indent, context)).join('\n');
  if (typeof node === 'string') return pad + node;

  switch (node.kind) {
    case 'component': {
      const importsStr = node.imports && node.imports.length > 0
        ? `import React, { ${node.imports.join(', ')} } from "react";`
        : 'import React from "react";';
      const hooksStr = (node.hooks || []).map(h => `  ${h}`).join('\n') + ((node.hooks && node.hooks.length > 0) ? '\n' : '');
      const body = serializeAstToJsx(node.body, 2, context);
      if (node.addition) {
        const lines = node.addition.code.split('\n').map(l => '      ' + l).join('\n');
        const additionBlock = `\n      {/* added per instruction: ${node.addition.id} */}\n${lines}`;
        return `${importsStr}\n\nexport default function ${node.name}() {\n${hooksStr}  return (\n    <>\n${body}${additionBlock}\n    </>\n  );\n}\n`;
      }
      return `${importsStr}\n\nexport default function ${node.name}() {\n${hooksStr}  return (\n${body}\n  );\n}\n`;
    }
    case 'fragment': {
      const children = (node.children || []).map(c => serializeAstToJsx(c, indent + 1, context)).join('\n');
      return `${pad}<>\n${children}\n${pad}</>`;
    }
    case 'text':
      return pad + node.value;
    case 'expression':
      return pad + `{${node.value}}`;
    case 'stateReference':
      return node.name;
    case 'handlerReference': {
      if (node.args && node.args.length > 0) {
        const argsStr = node.args.map(arg => (arg.kind === 'string' ? JSON.stringify(arg.value) : arg.value)).join(', ');
        return `() => ${node.name}(${argsStr})`;
      }
      return node.name;
    }
    case 'voidElement':
    case 'element': {
      let tag = node.tag;
      const newContext = { ...context };
      if (tag === 'form') {
        if (context.inForm) tag = 'div';
        else newContext.inForm = true;
      }
      let attrsStr = '';
      for (const [key, val] of Object.entries(node.attributes || {})) {
        if (val === undefined || val === null) continue;
        if (typeof val === 'string') attrsStr += ` ${key}=${JSON.stringify(val)}`;
        else if (typeof val === 'object') {
          if (val.kind === 'handlerReference' || val.kind === 'stateReference') attrsStr += ` ${key}={${serializeAstToJsx(val, 0, newContext)}}`;
          else if (val.kind === 'expression') attrsStr += ` ${key}={${val.value}}`;
          else attrsStr += ` ${key}={${JSON.stringify(val)}}`;
        } else if (typeof val === 'boolean') {
          if (val) attrsStr += ` ${key}`;
        } else attrsStr += ` ${key}={${val}}`;
      }
      if (node.kind === 'voidElement' || !(node.children && node.children.length > 0)) return `${pad}<${tag}${attrsStr} />`;
      const children = node.children.map(c => serializeAstToJsx(c, indent + 1, newContext)).join('\n');
      return `${pad}<${tag}${attrsStr}>\n${children}\n${pad}</${tag}>`;
    }
    case 'conditional': {
      const condition = serializeAstToJsx(node.condition, 0, context);
      const trueBranch = serializeAstToJsx(node.trueBranch, indent + 1, context);
      if (node.falseBranch) {
        const falseBranch = serializeAstToJsx(node.falseBranch, indent + 1, context);
        return `${pad}{${condition} ? (\n${trueBranch}\n${pad}) : (\n${falseBranch}\n${pad})}`;
      }
      return `${pad}{${condition} && (\n${trueBranch}\n${pad})}`;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseProgram(source) {
  return parser.parse(String(source || ''), {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: false,
  });
}

function jsxName(name) {
  if (!name) return '';
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return `${jsxName(name.object)}.${jsxName(name.property)}`;
  if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
  return '';
}

function isJsx(node) {
  return node && (node.type === 'JSXElement' || node.type === 'JSXFragment');
}

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'range']);

/** Generic child iteration over a Babel AST node. */
function forEachChild(node, fn) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => { if (item && typeof item.type === 'string') fn(item, node, key); });
    else if (value && typeof value.type === 'string') fn(value, node, key);
  }
}

function elementTag(node) {
  return node.type === 'JSXFragment' ? '' : jsxName(node.openingElement.name);
}

function attributeValue(element, name) {
  if (element.type !== 'JSXElement') return undefined;
  for (const attr of element.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute' || jsxName(attr.name) !== name) continue;
    if (!attr.value) return true;
    if (attr.value.type === 'StringLiteral') return attr.value.value;
    if (attr.value.type === 'JSXExpressionContainer' && attr.value.expression.type === 'StringLiteral') return attr.value.expression.value;
    return undefined;
  }
  return undefined;
}

function rawAttributes(source, element) {
  if (element.type !== 'JSXElement') return '';
  const attrs = element.openingElement.attributes;
  if (!attrs.length) return '';
  return source.slice(attrs[0].start, attrs[attrs.length - 1].end);
}

/**
 * Collects the outermost JSX nodes of the program. When the module has a
 * default-exported component, only its JSX counts as the rendered tree.
 */
function outermostJsx(ast) {
  let scope = ast.program;
  for (const statement of ast.program.body) {
    if (statement.type === 'ExportDefaultDeclaration') { scope = statement.declaration; break; }
  }
  const found = [];
  (function visit(node) {
    if (isJsx(node)) { found.push(node); return; }
    forEachChild(node, (child) => visit(child));
  })(scope);
  return found;
}

/** Simplified element tree consumed by services/validation. */
function toTagTree(source, node) {
  const children = [];
  const collect = (child) => {
    if (isJsx(child)) { children.push(toTagTree(source, child)); return; }
    forEachChild(child, collect);
  };
  for (const child of node.children || []) collect(child);
  if (node.type === 'JSXFragment') return { tag: '__fragment__', attrs: '', children, selfClosing: false };
  return {
    tag: elementTag(node),
    attrs: rawAttributes(source, node),
    children,
    selfClosing: Boolean(node.openingElement.selfClosing),
  };
}

/**
 * Parses JSX (a bare snippet or a full module) into a tag tree:
 * `{ tag, attrs, children, selfClosing }`. Multiple top-level elements are
 * wrapped in a synthetic `__root__` node. Throws on syntax errors.
 */
function parseJsx(source) {
  const text = String(source || '');
  const ast = parseProgram(text);
  const roots = outermostJsx(ast).map((node) => toTagTree(text, node));
  if (roots.length === 1) return roots[0];
  return { tag: '__root__', attrs: '', children: roots, selfClosing: false };
}

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------

function schemaIndex(schemaTree) {
  const byId = new Map();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.id) byId.set(String(node.id), node);
    for (const child of node.children || []) walk(child);
  })(schemaTree);
  return byId;
}

function tagsForNode(node) {
  return [...(TYPE_TO_ALLOWED_TAGS[node.type] || []), ...(ROLE_TO_TAGS[node.role] || [])];
}

/** Schema-wide set of tags that unattributed scaffolding elements may use. */
function buildWhitelist(schemaTree) {
  const allowed = new Set(ALWAYS_ALLOWED);
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    tagsForNode(node).forEach((tag) => allowed.add(tag));
    for (const child of node.children || []) walk(child);
  })(schemaTree);
  return allowed;
}

function definedComponents(ast) {
  const names = new Set();
  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportDefaultDeclaration' || statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (!declaration) continue;
    if (declaration.type === 'FunctionDeclaration' && declaration.id) names.add(declaration.id.name);
    if (declaration.type === 'VariableDeclaration') declaration.declarations.forEach((d) => { if (d.id && d.id.type === 'Identifier') names.add(d.id.name); });
  }
  return names;
}

// ---------------------------------------------------------------------------
// Structural checks
// ---------------------------------------------------------------------------

function inspectAst(ast) {
  const violations = [];
  let submitOutsideForm = 0;
  (function visit(node, inForm) {
    let nextInForm = inForm;
    if (node.type === 'JSXElement') {
      const tag = elementTag(node);
      if (VOID_ELEMENTS.has(tag) && (node.closingElement || node.children.length > 0)) {
        violations.push({ type: 'void-closing-tag', tag, line: node.loc && node.loc.start.line });
      }
      if (tag === 'form') {
        if (inForm) violations.push({ type: 'nested-form', tag, line: node.loc && node.loc.start.line });
        nextInForm = true;
      }
      if (tag === 'button' && attributeValue(node, 'type') === 'submit' && !inForm) submitOutsideForm += 1;
    }
    forEachChild(node, (child) => visit(child, nextInForm));
  })(ast.program, false);
  if (submitOutsideForm) violations.push({ type: 'submit-outside-form', count: submitOutsideForm });
  return violations;
}

/** Structural violations for a JSX source string; parse errors are reported, not thrown. */
function inspectJsxStructure(source) {
  try {
    return inspectAst(parseProgram(source));
  } catch (error) {
    return [{ type: 'parse-error', message: String(error.message || error).slice(0, 200) }];
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function countElements(node) {
  let count = 0;
  (function visit(current) {
    if (current.type === 'JSXElement') count += 1;
    forEachChild(current, visit);
  })(node);
  return count;
}

/**
 * Decides which elements to strip. Returns removal edits (outermost only) and
 * report entries. `whitelist` and `index` come from the schema.
 */
function filterTree(ast, { whitelist, index, components }) {
  const edits = [];
  const stripped = [];
  let strippedNodes = 0;
  let total = 0;

  (function visit(node, parent) {
    if (node.type === 'JSXElement') {
      total += 1;
      const tag = elementTag(node);
      const id = attributeValue(node, 'data-wireframe-id');
      let reason = null;
      if (typeof id === 'string') {
        const schemaNode = index.get(id);
        if (!schemaNode) reason = 'unknown-schema-id';
        else if (!ALWAYS_ALLOWED.has(tag) && !tagsForNode(schemaNode).includes(tag) && !components.has(tag)) reason = 'tag-not-allowed-for-node';
      } else if (/^[A-Z]/.test(tag) || tag.includes('.')) {
        if (!components.has(tag) && !RUNTIME_COMPONENTS.has(tag) && !ALWAYS_ALLOWED.has(tag)) reason = 'undefined-component';
      } else if (!whitelist.has(tag)) {
        reason = 'not-in-schema';
      }
      if (reason) {
        const subtree = countElements(node);
        total += subtree - 1;
        strippedNodes += subtree;
        stripped.push({ tag, id: typeof id === 'string' ? id : null, reason, line: node.loc && node.loc.start.line, nodes: subtree });
        let replacement = 'null';
        if (parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')) replacement = '';
        else if (parent && parent.type === 'JSXAttribute') replacement = '{null}';
        edits.push({ start: node.start, end: node.end, replacement });
        return;
      }
    }
    forEachChild(node, (child) => visit(child, node));
  })(ast.program, null);

  return { edits, stripped, strippedNodes, total };
}

function applyEdits(source, edits) {
  let output = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
  }
  return output;
}

/**
 * Runs CGDA over generated code (a JSX string or a typed codegen AST).
 * Returns `{ cleanedJsx, report, hallucinationRate, structuralViolations }`.
 * Unparseable input is returned unchanged with a `parse-error` violation so
 * the caller can fail the job instead of shipping broken code.
 */
function runCgda(astOrString, schemaTree) {
  const source = typeof astOrString === 'string' ? astOrString : serializeAstToJsx(astOrString);
  let ast;
  try {
    ast = parseProgram(source);
  } catch (error) {
    const violation = { type: 'parse-error', message: String(error.message || error).slice(0, 200) };
    return { cleanedJsx: source, report: { kept: 0, stripped: [], totalElements: 0, parseError: violation.message }, hallucinationRate: 0, structuralViolations: [violation] };
  }

  const whitelist = buildWhitelist(schemaTree || {});
  const index = schemaIndex(schemaTree || {});
  const components = definedComponents(ast);
  const { edits, stripped, strippedNodes, total } = filterTree(ast, { whitelist, index, components });
  const cleanedJsx = edits.length ? applyEdits(source, edits) : source;

  let structuralViolations;
  try {
    structuralViolations = inspectAst(edits.length ? parseProgram(cleanedJsx) : ast);
  } catch (error) {
    structuralViolations = [{ type: 'parse-error', message: String(error.message || error).slice(0, 200) }];
  }

  return {
    cleanedJsx,
    report: { kept: total - strippedNodes, stripped, totalElements: total },
    hallucinationRate: total ? strippedNodes / total : 0,
    structuralViolations,
  };
}

module.exports = {
  parseJsx,
  buildWhitelist,
  filterTree,
  runCgda,
  inspectJsxStructure,
  serializeAstToJsx,
  TYPE_TO_ALLOWED_TAGS,
  ROLE_TO_TAGS,
  VOID_ELEMENTS,
};
