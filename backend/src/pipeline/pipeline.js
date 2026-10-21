'use strict';

/**
 * The wireframe → React pipeline for one job:
 *   preprocess + style → detect (CV/OCR, optional vision) → schema → semantic
 *   plan → generate → CGDA → validate (+ parser gate) → fidelity → preview JS.
 *
 * Stage logic is the same as the original server.js; what changed is that it
 * runs inside the job runner (bounded, cancellable, timed out) and returns a
 * result object for persistence instead of mutating an in-memory job.
 */

const crypto = require('crypto');
const { buildSchema } = require('../../../services/schema/schema');
const { runCgda } = require('../../../services/cgda/cgda');
const { validateWithRetryAsync, MAX_RETRIES } = require('../../../services/validation/validate');
const { evaluateFidelity } = require('../../../services/validation/fidelity');
const { buildSemanticUiPlan } = require('../../../services/semantic/ui_plan');
const { callPython, callPythonFile, removeRuntimeDir } = require('./python');
const { validateGeneratedJsx, validateDependencyManifest, compilePreview, findUndeclaredIdentifiers, redact } = require('./compile');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function visionSummary(vision = {}, merge = {}) {
  const status = vision.status || {};
  const used = Boolean(vision.used);
  const meta = vision.errorMeta || {};
  const reason = redact(meta.safeMessage || vision.reason);
  const attempted = Boolean(status.enabled && status.configured);
  let category = meta.category || null;
  if (!status.enabled) category = 'disabled'; // a disabled provider is not a provider error
  else if (!category && reason) category = /timeout/i.test(reason) ? 'timeout' : /schema|json|bounds|node/i.test(reason) ? 'invalid-schema' : /disabled|no cloud|key is not configured/i.test(reason) ? 'disabled' : 'provider-error';
  return {
    requested: Boolean(status.enabled),
    attempted,
    used,
    provider: status.provider || null,
    model: status.model || null,
    status: used ? 'success' : category || 'fallback',
    httpStatus: meta.httpStatus || null,
    retryable: Boolean(meta.retryable),
    errorCategory: used ? null : category,
    errorMessage: used ? null : reason,
    schemaValidationStatus: used ? 'valid' : category === 'invalid-schema' ? 'invalid' : 'not-run',
    mergeStatus: used ? (merge.used ? 'success' : 'fallback') : 'not-run',
    schemaSource: used && merge.used ? 'vision-merged' : attempted ? 'local-cv-ocr-fallback' : 'local-cv-ocr',
  };
}

/**
 * @param {object} job        row from app.jobs (id, source_path, instructions)
 * @param {object} options    { signal, onStage(stage), stageTimeoutMs, genMode }
 */
async function runPipeline(job, { signal, onStage = async () => {}, stageTimeoutMs, genMode = 'template' }) {
  const call = { timeoutMs: stageTimeoutMs, signal };
  const instructions = String(job.instructions || '').slice(0, 1500);
  const checkAborted = () => { if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };

  try {
    await onStage('preprocess');
    const [preprocessing, styleEvidence] = await Promise.all([
      callPython(['preprocess', job.source_path], call),
      callPython(['style', job.source_path], call),
    ]);
    checkAborted();

    await onStage('detect');
    const detected = await callPython(['detect', job.source_path, instructions], call);
    checkAborted();
    const detections = detected.elements || [];
    const meta = detected.meta || {};
    const vision = visionSummary(meta.vision, meta.visionMerge);
    if (meta.vision) delete meta.vision.schema;
    const detectionMeta = { ...meta, vision, category: meta.category || 'generic' };

    await onStage('schema');
    const schema = buildSchema(detections);
    const schemaSource = schema.provenance?.schemaSource || 'local-cv-ocr-fallback';
    if (vision.schemaSource === 'vision-merged' && schemaSource !== 'vision-merged') detectionMeta.vision.mergeStatus = 'rejected-no-provenance';

    await onStage('generate');
    const plan = buildSemanticUiPlan(schema, { styleEvidence });
    const codegenSchema = plan.codegenSchema;
    const generated = await callPythonFile('generate-file', job.id, { schema: plan.codegenTree, errorReport: null, instructions }, call);
    checkAborted();

    await onStage('validate');
    const cgda = runCgda(generated.rawJsx, codegenSchema || schema);
    // The template compiler is deterministic: regenerating from the same tree
    // returns the same code, so retries only make sense in LLM mode.
    const retries = (generated.genMode || genMode) === 'template' ? 0 : MAX_RETRIES;
    const regenerate = async (_previous, diff) => {
      checkAborted();
      const out = await callPythonFile('generate-file', job.id, { schema: plan.codegenTree, errorReport: diff, instructions }, call);
      return runCgda(out.rawJsx, codegenSchema || schema).cleanedJsx;
    };
    const validation = await validateWithRetryAsync(codegenSchema || schema, cgda.cleanedJsx, regenerate, retries);
    const fidelity = evaluateFidelity(schema, { schemaSource });
    const code = validation.finalJsx;
    const parserCheck = validateGeneratedJsx(code);
    const dependencyCheck = validateDependencyManifest(code, plan.dependencyManifest || {});
    const structuralViolations = cgda.structuralViolations || [];
    // Parsing isn't enough: code that reads an undeclared name crashes on render.
    let undeclared = [];
    if (parserCheck.valid) { try { undeclared = findUndeclaredIdentifiers(code); } catch { /* parser gate already reports syntax */ } }
    const staticCheck = structuralViolations.length
      ? { valid: false, error: `Generated JSX structural violation: ${structuralViolations.map((item) => item.type).join(', ')}` }
      : !dependencyCheck.valid ? { valid: false, error: dependencyCheck.failures.join('; ') }
        : undeclared.length ? { valid: false, error: `Generated code uses names it never defines: ${undeclared.join(', ')}` } : parserCheck;

    let preview = null;
    let previewError = null;
    if (staticCheck.valid) {
      try { preview = compilePreview(code); } catch (error) { previewError = redact(error.message); }
    }
    const executable = staticCheck.valid && Boolean(preview);

    // `valid` covers what is actually verified: the code compiles and every
    // schema node is present. Fidelity is advisory — it requires a
    // source-vs-rendered visual score nothing computes yet, and it never passes
    // for the default local-CV schema — so gating status on it made `complete`
    // unreachable. It is reported alongside for review instead.
    const report = {
      ...validation,
      fidelity,
      valid: validation.valid && executable,
      fidelityStatus: fidelity.passed ? 'ready' : 'needs-review',
      cgda: cgda.report,
      hallucinationRate: cgda.hallucinationRate,
      structuralViolations,
      undeclaredIdentifiers: undeclared,
      jsxAstValidity: staticCheck.valid,
      generatedJsxStaticValid: staticCheck.valid,
      generatedJsxCompileError: staticCheck.error || previewError,
      generatedJsxExecutability: executable ? 'compiled' : 'failed',
      overallStatus: executable ? (fidelity.overallStatus || 'needs-review') : 'failed',
    };
    const status = !executable ? 'failed' : report.valid ? 'complete' : 'low_fidelity';
    const artifacts = [{ kind: 'jsx', content: code, sha256: sha256(code), byteLength: Buffer.byteLength(code), meta: { genMode: generated.genMode || genMode } }];
    if (preview) artifacts.push({ kind: 'preview-js', content: preview.js, sha256: sha256(preview.js), byteLength: Buffer.byteLength(preview.js), meta: { componentName: preview.componentName } });

    return {
      status,
      errorCode: executable ? null : 'invalid_generated_code',
      errorMessage: executable ? null : 'The generated code did not pass validation. Inspect the report, then regenerate.',
      genMode: generated.genMode || genMode,
      schemaSource,
      detections,
      detectionMeta,
      schema,
      validation: report,
      templates: generated.templates || [],
      recognizedInstructions: generated.recognizedInstructions || [],
      artifacts,
    };
  } finally {
    removeRuntimeDir(job.id);
  }
}

module.exports = { runPipeline, visionSummary };
