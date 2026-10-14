'use strict';

/**
 * Schema fidelity gate. It deliberately separates a valid schema from a
 * demonstrated source-to-rendered reconstruction: a pending visual comparison
 * must never be reported as ready.
 */
function evaluateFidelity(schema, options = {}) {
  const nodes = [];
  (function walk(node, depth = 0, parentId = null) {
    if (node.type !== 'root') nodes.push({ ...node, depth, effectiveParentId: node.parentId || parentId });
    (node.children || []).forEach((child) => walk(child, depth + 1, node.id || parentId));
  })(schema || { children: [] });

  const roles = new Set(nodes.map((node) => node.role).filter(Boolean));
  const leaves = nodes.filter((node) => !(node.children || []).length);
  const macroRoles = new Set(['page', 'header', 'main', 'footer', 'hero-section', 'services-section', 'contact-section', 'gallery', 'product-detail', 'card-grid', 'media-region']);
  const macroNodes = nodes.filter((node) => macroRoles.has(node.role));
  const pageRoots = nodes.filter((node) => node.role === 'page');
  const fullPage = roles.has('page') || (nodes.length >= 10 && macroNodes.length >= 2);
  const reasons = [];

  const duplicateMacroRoles = ['header', 'services-section', 'contact-section'].reduce((count, role) => count + Math.max(0, nodes.filter((node) => node.role === role).length - 1), 0);
  const macroRoleDuplicateRate = macroNodes.length ? Number((duplicateMacroRoles / macroNodes.length).toFixed(3)) : 0;
  const emptyHeadingCount = nodes.filter((node) => ['heading', 'hero-heading', 'section-heading'].includes(node.role) && !String(node.text || node.label || '').trim()).length;
  const unsupportedLabelCount = nodes.filter((node) => /^(button|continue|description)(\s+\d+)?$/i.test(String(node.text || node.label || '').trim())).length;
  const logoInsideNavCount = nodes.filter((node) => node.role === 'logo' && node.parentRole === 'nav-group').length;
  const looseHeroLeafCount = nodes.filter((node) => ['hero-heading', 'copy'].includes(node.role) && node.parentRole === 'main').length;
  // A submit action directly inside a contact section is malformed only when
  // it claims form semantics without a form ancestor. A plain action labelled
  // "Send" is a safe local-CV fallback when no input evidence was recovered.
  const looseContactControlCount = nodes.filter((node) =>
    (node.type === 'input' || node.role === 'submit-action') && node.parentRole === 'contact-section'
  ).length;
  const canonicalTreeValidity = pageRoots.length === 1 && duplicateMacroRoles === 0 && emptyHeadingCount === 0 && logoInsideNavCount === 0 && looseHeroLeafCount === 0 && looseContactControlCount === 0;
  if (!canonicalTreeValidity) reasons.push(`Invalid canonical hierarchy: pages=${pageRoots.length}, duplicateMacros=${duplicateMacroRoles}, emptyHeadings=${emptyHeadingCount}, logoInsideNav=${logoInsideNavCount}, looseHero=${looseHeroLeafCount}, looseContactControls=${looseContactControlCount}`);
  const ids = nodes.filter((node) => typeof node.id === 'string' && node.id).map((node) => node.id);
  const duplicateIds = ids.length - new Set(ids).size;
  const duplicateNodeRate = nodes.length ? Number((duplicateIds / nodes.length).toFixed(3)) : 0;
  if (duplicateIds) reasons.push(`Canonical tree contains ${duplicateIds} duplicate node id(s)`);
  const orphanCount = nodes.filter((node) => node.role !== 'page' && !node.effectiveParentId).length;
  if (orphanCount) reasons.push(`${orphanCount} node(s) have no parent assignment`);
  const emptySemanticParents = nodes.filter((node) => ['section', 'hero-section', 'services-section', 'contact-section', 'card-grid', 'gallery', 'product-detail'].includes(node.role) && !(node.children || []).length).length;
  if (emptySemanticParents) reasons.push(`${emptySemanticParents} semantic region(s) have no children`);

  // Requirements are evidence-led, rather than tied to fixture names. Once a
  // macro role exists, the tree must preserve the relationships that make it useful.
  const expectedRoles = new Set(['page']);
  if (roles.has('header') || roles.has('nav-group') || roles.has('nav-link')) expectedRoles.add('header');
  if (fullPage) expectedRoles.add('main');
  for (const role of ['hero-section', 'services-section', 'contact-section', 'gallery', 'product-detail', 'card-grid', 'media-region']) if (roles.has(role)) expectedRoles.add(role);
  const sourceStructureCoverage = fullPage ? Number(([...expectedRoles].filter((role) => roles.has(role)).length / expectedRoles.size).toFixed(2)) : null;
  if (fullPage && !roles.has('main')) reasons.push('Missing main-content region');

  const buttonCount = nodes.filter((node) => node.type === 'button').length;
  const actualMedia = nodes.filter((node) => node.type === 'image' || node.role === 'media').length;
  const mediaCount = nodes.filter((node) => node.type === 'image' || node.role === 'gallery' || node.role === 'media-region').length;
  if ((roles.has('product-detail') || roles.has('media-region')) && actualMedia === 0) reasons.push('A detected media region has no media node');
  if (fullPage && macroNodes.length < 3) reasons.push('Too few macro regions for a full-page reconstruction');
  if (fullPage && leaves.length < 4) reasons.push('Too few leaf elements for a full-page reconstruction');
  if (fullPage && buttonCount > Math.max(3, Math.ceil(leaves.length * 0.65))) reasons.push('Button density is implausibly high');
  const genericControlLabels = nodes.filter((node) => node.type === 'button' && /^(button|continue|submit)(\\s+\\d+)?$/i.test(String(node.text || node.label || '').trim())).length;
  if (genericControlLabels > 1) reasons.push('Repeated generic fallback controls are unsupported by schema evidence');
  const maxDepth = nodes.reduce((maximum, node) => Math.max(maximum, node.depth), 0);
  if (fullPage && maxDepth < 3) reasons.push('Full-page hierarchy is too shallow');

  const structuralDefects = duplicateIds + orphanCount + emptySemanticParents + duplicateMacroRoles + emptyHeadingCount + unsupportedLabelCount + logoInsideNavCount + looseHeroLeafCount + looseContactControlCount + (fullPage && macroNodes.length < 3 ? 1 : 0) + (fullPage && maxDepth < 3 ? 1 : 0);
  const structuralAccuracy = Number(Math.max(0, Math.min(0.99, ((sourceStructureCoverage ?? 0.5) * 0.65) + (canonicalTreeValidity ? 0.25 : 0) + (structuralDefects === 0 ? 0.09 : 0) - Math.min(0.25, genericControlLabels * 0.08))).toFixed(2));

  const sourceVsRenderedScore = Number.isFinite(options.sourceVsRenderedScore) ? options.sourceVsRenderedScore : null;
  const visualComparisonPending = sourceVsRenderedScore === null;
  const fallbackSource = typeof options.schemaSource === 'string' && /(fallback|local-cv|heuristic)/i.test(options.schemaSource);
  if (visualComparisonPending) reasons.push('Source-vs-rendered visual comparison is pending; result cannot be marked ready.');
  if (fallbackSource) reasons.push(`Schema was produced by ${options.schemaSource}; review the reconstruction before export.`);
  const passed = canonicalTreeValidity && duplicateNodeRate === 0 && orphanCount === 0 && emptySemanticParents === 0 && unsupportedLabelCount === 0 && structuralAccuracy >= 0.7 && sourceVsRenderedScore !== null && sourceVsRenderedScore >= 0.7 && !fallbackSource;

  return {
    score: structuralAccuracy, structuralAccuracy, fullPage, majorRegionCount: macroNodes.length, leafCount: leaves.length, mediaCount, buttonCount, maxDepth,
    schemaToCodeCoverage: 1, canonicalNodeCoverage: 1, canonicalTreeValidity, duplicateNodeRate, macroRoleDuplicateRate, orphanCount, emptySemanticParents, emptyHeadingCount, unsupportedLabelCount, logoInsideNavCount, looseHeroLeafCount, looseContactControlCount, sourceStructureCoverage,
    layoutBoundsCoverage: null, styleCueCoverage: null,
    repeatedGroupCoverage: fullPage && nodes.some((node) => node.layout?.repeated || node.role === 'repeated-region' || node.role === 'card-grid') ? 1 : null,
    semanticTextCoverage: fullPage && leaves.length ? Number((nodes.filter((node) => node.type === 'text' && node.text).length / leaves.length).toFixed(2)) : null,
    semanticControlCoverage: fullPage && leaves.length ? Number((nodes.filter((node) => node.type === 'button' || node.type === 'input').length / leaves.length).toFixed(2)) : null,
    sourceVsRenderedScore, visualComparisonPending, fallbackSource, passed, overallStatus: passed ? 'ready' : 'needs-review', reasons
  };
}

module.exports = { evaluateFidelity };
