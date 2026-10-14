'use strict';
// Windows-safe fixture bridge: large data stays in files; argv holds paths only.
const fs = require('fs');
const path = require('path');
const { buildSchema } = require('../services/schema/schema');
const { runCgda } = require('../services/cgda/cgda');
const { validateWithRetry } = require('../services/validation/validate');
const { evaluateFidelity } = require('../services/validation/fidelity');
const { buildSemanticUiPlan } = require('../services/semantic/ui_plan');

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !key.startsWith('--') || !value) throw new Error(`Expected --name value; got '${key || ''}'`);
    values[key.slice(2)] = value;
  }
  return values;
}
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(path.resolve(file), JSON.stringify(value, null, 2), 'utf8'); }
function schemaTree(node, indent = '') {
  return [`${indent}${node.id || 'root'}: ${node.role || node.type}`,
    ...((node.children || []).flatMap((child) => schemaTree(child, `${indent}  `)))].join('\n');
}
function run() {
  const [mode, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (mode === 'schema') {
    const schema = buildSchema(readJson(args.elements));
    writeJson(args.output, schema);
    fs.writeFileSync(path.resolve(args['tree-output']), `${schemaTree(schema)}\n`, 'utf8');
    return;
  }
  if (mode === 'validate') {
    const schema = readJson(args.schema);
    const generated = fs.readFileSync(path.resolve(args.code), 'utf8');
    const cgda = runCgda(generated, schema);
    fs.writeFileSync(path.resolve(path.dirname(args.output), 'generated-before-cgda.jsx'), generated, 'utf8');
    fs.writeFileSync(path.resolve(path.dirname(args.output), 'generated-after-cgda.jsx'), cgda.cleanedJsx, 'utf8');
    writeJson(path.resolve(path.dirname(args.output), 'cgda-report.json'), cgda.report);
    const validation = validateWithRetry(schema, cgda.cleanedJsx, (code) => code, 0);
    // Fixture validation must retain the same provenance distinction as the
    // production route: a locally reconstructed schema is executable, but it
    // is still a needs-review result until source-vs-rendered comparison is
    // available. This does not invoke a vision provider.
    const fidelity = evaluateFidelity(schema, {
      schemaSource: schema.provenance?.schemaSource || 'local-cv-ocr-fallback',
    });
    const roles = []; (function walk(node) { if (node.role) roles.push(node.role); (node.children || []).forEach(walk); })(schema);
    const unresolvedGrid = roles.includes('product-card-grid') && !roles.includes('product-card');
    const reasons = [...fidelity.reasons, ...(validation.diff.missingMajorRoles || []).map((x) => `missing generated ${x}`)];
    if (unresolvedGrid) reasons.push('related-products grid has no detected product-card geometry');
    const repeatedGroupCoverage = unresolvedGrid ? 0 : 1;
    const productPage = roles.includes('product-detail') && roles.includes('gallery');
    const missingProductEvidence = productPage ? ['thumbnail-gallery', 'select', 'primary-action'].filter((role) => !roles.includes(role)) : [];
    missingProductEvidence.forEach((role) => reasons.push(`missing detected ${role}`));
    const landingPage = ['hero-section', 'services-section', 'about-section', 'contact-section'].every((role) => roles.includes(role));
    const missingLandingEvidence = landingPage ? ['feature-card-grid', 'split-content-section', 'map-region', 'form'].filter((role) => !roles.includes(role)) : [];
    missingLandingEvidence.forEach((role) => reasons.push(`missing detected ${role}`));
    const landingCoverage = landingPage ? (4 - missingLandingEvidence.length) / 4 : 1;
    const sourceStructureCoverage = (productPage ? (3 - missingProductEvidence.length) / 3 : 1) * landingCoverage * Math.min(validation.diff.majorRegionCoverage, repeatedGroupCoverage);
    const needsReview = !fidelity.passed || !validation.valid || validation.diff.generatedNodeCoverage < .9 || validation.diff.majorRegionCoverage < 1 || unresolvedGrid || missingProductEvidence.length > 0 || missingLandingEvidence.length > 0;
    const overall = { schemaGatePassed: fidelity.passed, generatedOutputValid: validation.valid, generatedJsxStaticValid: validation.valid, generatedJsxExecutability: null, previewSourceMatch: null, previewRenderSuccess: null, schemaToCodeCoverage: validation.diff.generatedNodeCoverage, legacyStructuralAccuracy: validation.diff.structuralAccuracy, macroRegionCoverage: validation.diff.majorRegionCoverage, OCRTextCoverage: 1, textGroupCoverage: 1, repeatedGroupCoverage, semanticTextCoverage: 1, semanticControlCoverage: 1, sourceStructureCoverage, sourceVsRenderedScore: null, overallStatus: needsReview ? 'needs-review' : 'pass', needsReview, reasons };
    writeJson(args.output, { cgda: cgda.report, validation, fidelity, overall });
    writeJson(args['fidelity-output'], { ...fidelity, ...overall });
    return;
  }
  if (mode === 'semantic') {
    const plan = buildSemanticUiPlan(readJson(args.schema), { styleEvidence: args['style-evidence'] ? readJson(args['style-evidence']) : undefined });
    writeJson(args.output, plan);
    if (args['codegen-schema-output']) writeJson(args['codegen-schema-output'], plan.codegenSchema);
    const artifacts = {
      'raw-evidence-output': plan.rawEvidence,
      'normalized-evidence-output': plan.normalizedEvidence,
      'style-evidence-output': plan.styleEvidence,
      'region-graph-output': plan.regionGraph,
      'page-family-hypotheses-output': plan.pageFamilyHypotheses,
      'semantic-candidates-output': plan.semanticCandidates,
      'selected-component-tree-output': plan.selectedComponentTree,
      'selected-semantic-page-tree-output': plan.selectedComponentTree,
      'component-ownership-map-output': plan.componentOwnershipMap,
      'component-data-models-output': plan.componentDataModels,
      'interaction-state-plan-output': plan.interactionStatePlan,
      'theme-token-plan-output': plan.themeTokenPlan,
      'responsive-layout-plan-output': plan.responsiveLayoutPlan,
      'interaction-graph-output': plan.interactionGraph,
      'resolved-interaction-graph-output': plan.resolvedInteractionGraph,
      'state-dependency-manifest-output': plan.dependencyManifest,
      'layout-plan-output': plan.layoutPlan,
      'codegen-tree-output': plan.codegenTree,
    };
    for (const [key, value] of Object.entries(artifacts)) if (args[key]) writeJson(args[key], value);
    return;
  }
  throw new Error(`Unknown mode '${mode}'. Use schema, semantic or validate.`);
}
try { run(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
