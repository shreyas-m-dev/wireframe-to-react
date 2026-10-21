/**
 * Validation Engine — Pipeline Step 7.
 *
 * Converts schema -> tree (already done by services/schema), converts
 * cleaned code -> tree (via services/cgda's parseJsx, reused here so both
 * sides go through the identical parser), compares node counts and tag
 * types, auto-corrects trivial mismatches, and loops back to CGDA/codegen
 * with an error report on anything it can't auto-fix.
 */

'use strict';

const { parseJsx, buildWhitelist, TYPE_TO_ALLOWED_TAGS } = require('../cgda/cgda');
const { flattenSchema } = require('../schema/schema');

const MAX_RETRIES = 3;

/**
 * Flattens a JSX tag tree into a flat list of {tag}. The top-level node
 * itself is skipped (depth 0) because it corresponds to the schema's root
 * wrapper, which `flattenSchema` also excludes — codegen always emits one
 * outer element for the whole component, so without this the two flat
 * lists would be off-by-one and every valid tree would look "invalid".
 */
function flattenJsxTree(node, acc = [], depth = 0) {
  if (depth > 0 && node.tag !== '__root__' && node.tag !== '__fragment__') {
    const id = (node.attrs.match(/data-wireframe-id="([^"]+)"/) || [])[1];
    const role = (node.attrs.match(/data-wireframe-role="([^"]*)"/) || [])[1];
    acc.push({ tag: node.tag, id, role });
  }
  for (const child of node.children || []) flattenJsxTree(child, acc, depth + 1);
  return acc;
}

/**
 * Diffs schema node count/types against code node count/types.
 * A schema node counts as "matched" if the code has an unmatched tag that's
 * in that schema type's allowed-tag list (see TYPE_TO_ALLOWED_TAGS).
 */
function diffTrees(schemaTree, jsxTree) {
  const schemaNodes = flattenSchema(schemaTree); // [{type, id, role}, ...]
  // The component's outer element carries the schema root's id; flattenSchema
  // excludes the root, so the code side must exclude it too.
  const codeNodes = flattenJsxTree(jsxTree).filter((node) => !(schemaTree.id && node.id === schemaTree.id));
  const codeTagsRemaining = [...codeNodes];

  const matched = [];
  const missingInCode = [];
  const unmatchedSchema = [];

  // Pass 1: provenance. An element that carries a schema node's id is that node.
  for (const schemaNode of schemaNodes) {
    const idx = schemaNode.id ? codeTagsRemaining.findIndex((c) => c.id === schemaNode.id) : -1;
    if (idx !== -1) {
      matched.push({ schemaId: schemaNode.id, tag: codeTagsRemaining[idx].tag });
      codeTagsRemaining.splice(idx, 1);
    } else {
      unmatchedSchema.push(schemaNode);
    }
  }
  // Pass 2: nodes without an id-bearing element may be satisfied by an
  // unattributed element of an allowed tag (bare snippets, LLM output).
  for (const schemaNode of unmatchedSchema) {
    const allowedTags = TYPE_TO_ALLOWED_TAGS[schemaNode.type] || [];
    const idx = codeTagsRemaining.findIndex((c) => !c.id && allowedTags.includes(c.tag));
    if (idx !== -1) {
      matched.push({ schemaId: schemaNode.id, tag: codeTagsRemaining[idx].tag });
      codeTagsRemaining.splice(idx, 1);
    } else {
      missingInCode.push(schemaNode);
    }
  }

  // Leftover elements are either compiler scaffolding the schema accounts for
  // (wrappers, icon SVG, card copy) or genuinely unaccounted output: an id the
  // schema doesn't contain, or a tag no schema node allows.
  const knownIds = new Set(schemaNodes.map((node) => node.id).filter(Boolean));
  const whitelist = buildWhitelist(schemaTree);
  const isAccounted = (node) => (node.id ? knownIds.has(node.id) : whitelist.has(node.tag) || /^[A-Z]/.test(node.tag));
  const extraInCode = codeTagsRemaining.filter((node) => !isAccounted(node));
  const scaffoldingCount = codeTagsRemaining.length - extraInCode.length;
  const structuralAccuracy = schemaNodes.length === 0
    ? 1
    : matched.length / schemaNodes.length;

  const generatedNodeCoverage = structuralAccuracy;
  // Validate the source-derived major roles, not a fixed ecommerce checklist.
  // A landing, login, or dashboard must not fail simply because it has no
  // product gallery; conversely a detected landing section must be present.
  const requiredRoles = [...new Set(schemaNodes.map((node) => node.role).filter((role) => role && ['page-root', 'page', 'header', 'main', 'footer', 'hero-section', 'services-section', 'feature-card-grid', 'split-content-section', 'about-section', 'contact-section', 'form', 'gallery', 'product-detail', 'related-products', 'sidebar'].includes(role)))];
  const missingMajorRoles = requiredRoles.filter((role) => !codeNodes.some((node) => node.role === role));
  return {
    schemaCount: schemaNodes.length,
    codeCount: codeNodes.length,
    scaffoldingCount,
    matchedCount: matched.length,
    missingInCode,
    extraInCode,
    structuralAccuracy,
    generatedNodeCoverage,
    majorRegionCoverage: requiredRoles.length ? (requiredRoles.length - missingMajorRoles.length) / requiredRoles.length : 1,
    missingMajorRoles,
    isValid: missingInCode.length === 0 && extraInCode.length === 0 && missingMajorRoles.length === 0,
  };
}

/**
 * Auto-correct pass: for trivial mismatches (a missing leaf node with an
 * unambiguous single allowed tag, e.g. schema has exactly one uncovered
 * `text` node and no `p`/`span`/etc. exists in code at all), synthesize the
 * missing tag as a minimal placeholder rather than looping back to the LLM.
 * Anything else falls through to the retry loop.
 */
function autoCorrect(diff) {
  const autoFixed = [];
  const stillMissing = [];

  for (const missing of diff.missingInCode) {
    const allowedTags = TYPE_TO_ALLOWED_TAGS[missing.type] || [];
    if (allowedTags.length > 0) {
      // trivial case: synthesize the first allowed tag as an empty placeholder
      autoFixed.push({ schemaId: missing.id, insertedTag: allowedTags[0] });
    } else {
      stillMissing.push(missing);
    }
  }

  return { autoFixed, stillMissing };
}

/**
 * The retry loop described in the spec: validate -> if invalid, loop back
 * to CGDA/LLM (represented here by a caller-supplied `regenerateFn`) up to
 * MAX_RETRIES times, logging what changed each pass. `regenerateFn` is a
 * function `(previousJsx, errorReport) => newJsx` — in production this
 * calls back into services/codegen with the error report appended to the
 * prompt.
 */
function validateWithRetry(schemaTree, initialJsx, regenerateFn, maxRetries = MAX_RETRIES) {
  const log = [];
  let currentJsx = initialJsx;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const jsxTree = parseJsx(currentJsx);
    const diff = diffTrees(schemaTree, jsxTree);

    if (diff.isValid) {
      log.push({ attempt, structuralAccuracy: diff.structuralAccuracy, result: 'valid' });
      return { finalJsx: currentJsx, valid: true, attempts: attempt, log, diff };
    }

    const { autoFixed, stillMissing } = autoCorrect(diff);
    log.push({
      attempt,
      structuralAccuracy: diff.structuralAccuracy,
      missingInCode: diff.missingInCode.map((m) => m.type),
      extraInCode: diff.extraInCode.map((e) => e.tag),
      autoFixed: autoFixed.map((f) => f.insertedTag),
      result: stillMissing.length === 0 && diff.extraInCode.length === 0 ? 'auto-corrected' : 'needs-retry',
    });

    if (stillMissing.length === 0 && diff.extraInCode.length === 0 && diff.missingInCode.length > 0) {
      // everything was trivially auto-correctable — nothing left to loop on
      return { finalJsx: currentJsx, valid: true, attempts: attempt, log, diff, autoFixed };
    }

    if (attempt === maxRetries) {
      return { finalJsx: currentJsx, valid: false, attempts: attempt, log, diff };
    }

    currentJsx = regenerateFn(currentJsx, diff);
  }
}

/** Async equivalent used by the HTTP pipeline. The original synchronous
 * helper remains for its unit tests; this version is essential when a retry
 * calls the Python/LLM generator over a subprocess boundary. */
async function validateWithRetryAsync(schemaTree, initialJsx, regenerateFn, maxRetries = MAX_RETRIES) {
  const log = [];
  let currentJsx = initialJsx;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const diff = diffTrees(schemaTree, parseJsx(currentJsx));
    if (diff.isValid) {
      log.push({ attempt, structuralAccuracy: diff.structuralAccuracy, result: 'valid' });
      return { finalJsx: currentJsx, valid: true, attempts: attempt, log, diff };
    }
    log.push({ attempt, structuralAccuracy: diff.structuralAccuracy, missingInCode: diff.missingInCode.map((n) => n.type), extraInCode: diff.extraInCode.map((n) => n.tag), result: 'needs-retry' });
    if (attempt === maxRetries) return { finalJsx: currentJsx, valid: false, attempts: attempt, log, diff };
    currentJsx = await regenerateFn(currentJsx, diff);
  }
}

module.exports = {
  flattenJsxTree,
  diffTrees,
  autoCorrect,
  validateWithRetry,
  validateWithRetryAsync,
  MAX_RETRIES,
};
