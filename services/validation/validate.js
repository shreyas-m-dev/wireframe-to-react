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

const { parseJsx } = require('../cgda/cgda');
const { flattenSchema, TYPE_TO_ALLOWED_TAGS } = (() => {
  const schema = require('../schema/schema');
  const { TYPE_TO_ALLOWED_TAGS } = require('../cgda/cgda');
  return { flattenSchema: schema.flattenSchema, TYPE_TO_ALLOWED_TAGS };
})();

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
  const schemaNodes = flattenSchema(schemaTree); // [{type, id}, ...]
  const codeNodes = flattenJsxTree(jsxTree);      // [{tag}, ...]
  const codeTagsRemaining = [...codeNodes];

  const matched = [];
  const missingInCode = [];

  for (const schemaNode of schemaNodes) {
    const allowedTags = TYPE_TO_ALLOWED_TAGS[schemaNode.type] || [];
    const idx = codeTagsRemaining.findIndex((c) => c.id === schemaNode.id) !== -1
      ? codeTagsRemaining.findIndex((c) => c.id === schemaNode.id)
      : codeTagsRemaining.findIndex((c) => allowedTags.includes(c.tag));
    if (idx !== -1) {
      matched.push({ schemaId: schemaNode.id, tag: codeTagsRemaining[idx].tag });
      codeTagsRemaining.splice(idx, 1);
    } else {
      missingInCode.push(schemaNode);
    }
  }

  // whatever's left in codeTagsRemaining is extra (should be near-zero if
  // CGDA already ran, but catches drift e.g. a whitelisted-but-unused tag)
  const extraInCode = codeTagsRemaining;

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
    matchedCount: matched.length,
    missingInCode,
    extraInCode,
    structuralAccuracy,
    generatedNodeCoverage,
    majorRegionCoverage: (requiredRoles.length - missingMajorRoles.length) / requiredRoles.length,
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
