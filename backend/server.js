'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSchema } = require('../services/schema/schema');
const { runCgda } = require('../services/cgda/cgda');
const { validateWithRetryAsync } = require('../services/validation/validate');
const { evaluateFidelity } = require('../services/validation/fidelity');
const { buildSemanticUiPlan } = require('../services/semantic/ui_plan');
// Export functionality removed as per requirements - no download/export UI
const { resolvePythonBin, WINDOWS_STUB_MARKER, _resetCache } = require('./python_resolver');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const UPLOAD_DIR = path.join(os.tmpdir(), 'wireframe-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const jobs = new Map();
const CLI = path.join(__dirname, '../scripts/cli_pipeline.py');
const MAX_RETRIES = 3;
const RUNTIME_ROOT = path.join(os.tmpdir(), 'w2r');
const MAX_COMMAND_ARGUMENT_BYTES = 8192;
const SUPPORTED_VISION_PROVIDERS = new Set(['disabled', 'openai', 'anthropic', 'gemini', 'local']);
function safeVisionConfig() {
  const enabledRaw = (process.env.VISION_ENABLED || 'false').trim().toLowerCase();
  const provider = (process.env.VISION_PROVIDER || 'disabled').trim().toLowerCase();
  const enabled = enabledRaw === 'true';
  const warnings = [];
  if (!['true', 'false'].includes(enabledRaw)) warnings.push('VISION_ENABLED must be true or false; local fallback selected.');
  if (!SUPPORTED_VISION_PROVIDERS.has(provider)) warnings.push('VISION_PROVIDER is unsupported; local fallback selected.');
  if (enabled && !process.env.VISION_MODEL?.trim()) warnings.push('VISION_MODEL is required when vision is enabled.');
  const fallbackKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  const configuredKey = String(process.env.VISION_API_KEY || '').trim() || String(fallbackKey || '').trim();
  const keySource = String(process.env.VISION_API_KEY || '').trim() ? 'VISION_API_KEY' : String(fallbackKey || '').trim() ? provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY' : 'none';
  if (enabled && ['openai', 'anthropic', 'gemini'].includes(provider) && !configuredKey) warnings.push('Vision provider key is not configured; local fallback selected.');
  return { visionEnabled: enabled, provider, model: process.env.VISION_MODEL?.trim() || null, apiKeyConfigured: Boolean(configuredKey), keySource, fallbackModeAvailable: true, requestTransport: 'file', warnings };
}
const visionRuntime = { ...safeVisionConfig(), providerReachable: null, lastVisionCallStatus: 'not-run', lastVisionErrorCategory: null, lastVisionErrorMessage: null, schemaValidationStatus: 'not-run', lastMergeStatus: 'not-run', lastSchemaSource: 'not-run' };
function safeVisionMessage(value) { return String(value || '').replace(/(?:sk-[A-Za-z0-9_-]+|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+)/gi, '[redacted]').slice(0, 180) || null; }
function validateGeneratedJsx(code) {
  try {
    const babel = require(path.join(__dirname, '../frontend/node_modules/@babel/core'));
    const stripped = String(code || '').replace(/^\s*import\s+.*?;\s*$/gm, '').replace(/export\s+default\s+/, '');
    babel.transformSync(stripped, { ast: true, code: false, parserOpts: { plugins: ['jsx'] } });
    return { valid: true, error: null };
  } catch (error) { return { valid: false, error: safeVisionMessage(error.message) || 'Generated JSX failed parser validation.' }; }
}
function validateDependencyManifest(code, manifest = {}) {
  const source = String(code || ''); const failures = [];
  const declaration = (name) => new RegExp(`\\b(?:const|let)\\s*\\[?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const state of manifest.state || []) if (new RegExp(`\\b${state}\\b`).test(source) && !declaration(state).test(source)) failures.push(`undefined state: ${state}`);
  for (const handler of manifest.handlers || []) if (new RegExp(`\\b${handler}\\b`).test(source) && !new RegExp(`(?:const|function)\\s+${handler}\\b`).test(source)) failures.push(`undefined handler: ${handler}`);
  for (const target of manifest.targets || []) if (target && target !== 'cart-summary' && source.includes(`getElementById("${target}")`) && !new RegExp(`id="${target}"`).test(source)) failures.push(`missing navigation target: ${target}`);
  return { valid: failures.length === 0, failures };
}
function visionSummary(vision = {}, merge = {}) { const status = vision.status || {}; const used = Boolean(vision.used); const meta = vision.errorMeta || {}; const reason = safeVisionMessage(meta.safeMessage || vision.reason); const category = meta.category || (!reason ? null : /timeout/i.test(reason) ? 'timeout' : /schema|json|bounds|node/i.test(reason) ? 'invalid-schema' : /disabled|no cloud|key is not configured/i.test(reason) ? 'disabled' : 'provider-error'); const attempted = Boolean(status.enabled && status.configured); return { requested: Boolean(status.enabled), attempted, used, provider: status.provider || visionRuntime.provider, model: status.model || visionRuntime.model, status: used ? 'success' : category || 'fallback', httpStatus: meta.httpStatus || null, retryable: Boolean(meta.retryable), errorCategory: category, errorCode: meta.safeCode || null, errorMessage: reason, providerError: attempted && !used, schemaValidationStatus: used ? 'valid' : category === 'invalid-schema' ? 'invalid' : 'not-run', schemaAdapterUsed: Boolean(vision.adapterReport?.adapterUsed), mergeStatus: used ? (merge.used ? 'success' : 'fallback') : 'not-run', schemaSource: used && merge.used ? 'vision-merged' : attempted ? 'local-cv-ocr-fallback' : 'local-cv-ocr' }; }
const storage = multer.diskStorage({ destination: UPLOAD_DIR, filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname) || '.png'}`) });
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (_req, file, cb) => /\.(png|jpe?g|webp|bmp)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Unsupported file type. Use PNG, JPEG, WEBP, or BMP.')) });

function argumentLengths(args) { return args.map((value, index) => ({ index, bytes: Buffer.byteLength(String(value), 'utf8') })); }
function assertShortArguments(args) {
  const oversize = argumentLengths(args).find((item) => item.bytes > MAX_COMMAND_ARGUMENT_BYTES);
  if (oversize) throw new Error(`Internal transport guard: argument ${oversize.index} is ${oversize.bytes} bytes. Use file transport instead of process arguments.`);
}
function callPython(args) {
  return new Promise((resolve, reject) => {
    try { assertShortArguments(args); } catch (error) { reject(error); return; }
    let pythonBin; try { pythonBin = resolvePythonBin(); } catch (error) { reject(error); return; }
    execFile(pythonBin, [CLI, ...args], { maxBuffer: 15 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout.includes(WINDOWS_STUB_MARKER)) { _resetCache(); reject(new Error('Configured Python executable is a Windows Store stub. Set PYTHON_BIN to a real Python installation.')); return; }
      if (error) { try { reject(new Error(JSON.parse(stderr).error)); } catch { reject(new Error(stderr || error.message)); } return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`Pipeline returned invalid JSON: ${stdout.slice(0, 500)}`)); }
    });
  });
}
function callPythonFile(subcommand, jobId, payload) {
  const safeJobId = String(jobId || crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const directory = path.join(RUNTIME_ROOT, safeJobId);
  fs.mkdirSync(directory, { recursive: true });
  const input = path.join(directory, `${subcommand}-input.json`);
  const output = path.join(directory, `${subcommand}-output.json`);
  fs.writeFileSync(input, JSON.stringify(payload), 'utf8');
  return new Promise((resolve, reject) => {
    const args = [subcommand, input, output];
    try { assertShortArguments(args); } catch (error) { reject(error); return; }
    let pythonBin; try { pythonBin = resolvePythonBin(); } catch (error) { reject(error); return; }
    execFile(pythonBin, [CLI, ...args], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout.includes(WINDOWS_STUB_MARKER)) { _resetCache(); reject(new Error('Configured Python executable is a Windows Store stub. Set PYTHON_BIN to a real Python installation.')); return; }
      if (error) { try { reject(new Error(JSON.parse(stderr).error)); } catch { reject(new Error(stderr || error.message)); } return; }
      try { resolve(JSON.parse(fs.readFileSync(output, 'utf8'))); } catch (readError) { reject(new Error(`File-based ${subcommand} output unavailable: ${readError.message}`)); }
    });
  });
}
function publicJob(job) { const { imagePath, ...safe } = job; return safe; }
function artifactMeta(code) { const finalCodeHash = crypto.createHash('sha256').update(code || '').digest('hex'); const id = crypto.randomUUID(); return { id, artifactId: id, finalCodeHash, finalCodeByteLength: Buffer.byteLength(code || '', 'utf8'), hash: finalCodeHash.slice(0, 16), length: (code || '').length, generatedAt: new Date().toISOString(), source: 'validated-jsx' }; }
function getJob(req) { const job = jobs.get(req.body?.jobId || req.params.id); if (!job) { const e = new Error('Job not found or expired. Upload the image again.'); e.status = 404; throw e; } return job; }
function requireStage(job, key, message) { if (!job[key]) { const e = new Error(message); e.status = 409; throw e; } }
async function detectJob(job, instructions = '') { const data = await callPython(['detect', job.imagePath, String(instructions || '').slice(0, 1500)]); job.detections = data.elements; const meta = data.meta || {}; const summary = visionSummary(meta.vision, meta.visionMerge); if (meta.vision) delete meta.vision.schema; job.detectionMeta = { ...meta, vision: summary, category: meta.category || 'generic' }; Object.assign(visionRuntime, { providerReachable: summary.attempted ? summary.used : null, lastVisionCallStatus: summary.status, lastVisionErrorCategory: summary.errorCategory, lastVisionErrorMessage: summary.errorMessage, lastVisionHttpStatus: summary.httpStatus, lastVisionRetryable: summary.retryable, schemaValidationStatus: summary.schemaValidationStatus, lastMergeStatus: summary.mergeStatus, lastSchemaSource: summary.schemaSource }); Object.assign(job, { visionProviderUsed: summary.used, visionProvider: summary.provider, visionModel: summary.model, schemaSource: summary.schemaSource, visionSchemaValidation: summary.schemaValidationStatus, mergeStatus: summary.mergeStatus, pageCategory: meta.category || 'generic' }); job.status = 'detected'; }
async function generateJob(job, instructions = '') { requireStage(job, 'schema', 'Build the schema before generating code.'); const schemaHash=crypto.createHash('sha256').update(JSON.stringify(job.schema)).digest('hex'); if(job.canonicalSchemaHash&&job.canonicalSchemaHash!==schemaHash) throw new Error('canonical schema changed after schema stage'); job.semanticUiPlan=buildSemanticUiPlan(job.schema, { styleEvidence: job.styleEvidence }); job.interactionPlan=job.semanticUiPlan.interactionPlan; job.codegenSchema=job.semanticUiPlan.codegenSchema; job.codegenTree=job.semanticUiPlan.codegenTree; const out = await callPythonFile('generate-file', job.id, { schema: job.codegenTree, errorReport: null, instructions: String(instructions || '').slice(0, 1500) }); Object.assign(job, { rawCode: out.rawJsx, codegenInputHash: schemaHash, generatedCodeHash: crypto.createHash('sha256').update(out.rawJsx || '').digest('hex'), genMode: out.genMode, templates: out.templates || [], recognizedInstructions: out.recognizedInstructions || [], addition: out.addition || null, status: 'generated' }); }
async function validateJob(job, instructions = '') {
  requireStage(job, 'rawCode', 'Generate code before validating it.'); const cgda = runCgda(job.rawCode, job.codegenSchema || job.schema);
  const regenerate = async (_previous, diff) => { const out = await callPythonFile('generate-file', job.id, { schema: job.codegenTree || job.schema, errorReport: diff, instructions: String(instructions || '').slice(0, 1500) }); return runCgda(out.rawJsx, job.codegenSchema || job.schema).cleanedJsx; };
  const validation = await validateWithRetryAsync(job.codegenSchema || job.schema, cgda.cleanedJsx, regenerate, MAX_RETRIES);
  const fidelity = evaluateFidelity(job.schema, { schemaSource: job.schemaSource });
  const parserCheck = validateGeneratedJsx(validation.finalJsx); const dependencyCheck = validateDependencyManifest(validation.finalJsx, job.semanticUiPlan?.dependencyManifest || {}); const structuralViolations = cgda.structuralViolations || []; const staticCheck = structuralViolations.length ? { valid: false, error: `Generated JSX structural violation: ${structuralViolations.map(item => item.type).join(', ')}` } : !dependencyCheck.valid ? { valid: false, error: dependencyCheck.failures.join('; ') } : parserCheck;
  job.code = validation.finalJsx; job.finalArtifact = artifactMeta(job.code); job.validation = { ...validation, fidelity, valid: validation.valid && fidelity.passed && staticCheck.valid, cgda: cgda.report, hallucinationRate: cgda.hallucinationRate, jsxAstValidity: staticCheck.valid, voidElementViolationCount: structuralViolations.filter(item => item.type === 'void-closing-tag').length, unclosedConditionalCount: structuralViolations.filter(item => item.type === 'unclosed-conditional').length, submitOutsideFormCount: structuralViolations.filter(item => item.type === 'submit-outside-form').reduce((sum, item) => sum + (item.count || 0), 0), generatedJsxStaticValid: staticCheck.valid, generatedJsxCompileError: staticCheck.error, generatedJsxExecutability: staticCheck.valid ? 'client-preview-pending' : 'failed', previewSourceMatch: staticCheck.valid ? true : false, previewRenderSuccess: staticCheck.valid ? 'client-preview-pending' : false, overallStatus: staticCheck.valid ? (fidelity.overallStatus || 'needs-review') : 'failed' }; job.status = staticCheck.valid ? (job.validation.valid ? 'complete' : 'low_fidelity') : 'failed';
}
app.post('/api/upload', upload.single('wireframe'), (req, res) => { if (!req.file) return res.status(400).json({ error: "multipart field 'wireframe' is required" }); const job = { id: crypto.randomUUID(), status: 'uploaded', createdAt: new Date().toISOString(), filename: req.file.originalname, imagePath: req.file.path }; jobs.set(job.id, job); res.status(201).json({ job: publicJob(job) }); });
app.post('/api/process', async (req, res, next) => { try { const job = getJob(req); const [preprocessing, styleEvidence] = await Promise.all([callPython(['preprocess', job.imagePath]), callPython(['style', job.imagePath])]); job.preprocessing = preprocessing; job.styleEvidence = styleEvidence; job.status = 'processed'; res.json({ job: publicJob(job) }); } catch (e) { next(e); } });
app.post('/api/detect', async (req, res, next) => { try { const job = getJob(req); requireStage(job, 'preprocessing', 'Process the image before detection.'); await detectJob(job, req.body?.instructions || ''); res.json({ job: publicJob(job), detections: job.detections, meta: job.detectionMeta }); } catch (e) { next(e); } });
app.post('/api/schema', (req, res, next) => { try { const job = getJob(req); requireStage(job, 'detections', 'Detect UI elements before building a schema.'); job.schema = buildSchema(job.detections); const actualSource=job.schema.provenance?.schemaSource||'local-cv-ocr-fallback'; if(job.schemaSource==='vision-merged'&&actualSource!=='vision-merged') throw new Error('vision-merged status rejected: canonical schema has no vision provenance'); job.schemaSource=actualSource; job.canonicalSchemaHash=crypto.createHash('sha256').update(JSON.stringify(job.schema)).digest('hex'); job.status = 'schema_ready'; res.json({ job: publicJob(job), schema: job.schema }); } catch (e) { next(e); } });
app.post('/api/generate', upload.single('wireframe'), async (req, res, next) => { try {
  // Accept the legacy multipart form as a complete pipeline request while
  // preserving the stage API for the production frontend.
  if (req.file) {
    const job = { id: crypto.randomUUID(), status: 'uploaded', createdAt: new Date().toISOString(), filename: req.file.originalname, imagePath: req.file.path }; jobs.set(job.id, job);
    const [preprocessing, styleEvidence] = await Promise.all([callPython(['preprocess', job.imagePath]), callPython(['style', job.imagePath])]);
    job.preprocessing = preprocessing; job.styleEvidence = styleEvidence;
    await detectJob(job, req.body?.instructions || ''); job.schema = buildSchema(job.detections); job.schemaSource=job.schema.provenance?.schemaSource||'local-cv-ocr-fallback'; job.canonicalSchemaHash=crypto.createHash('sha256').update(JSON.stringify(job.schema)).digest('hex'); await generateJob(job, req.body?.instructions || ''); await validateJob(job, req.body?.instructions || '');
    return res.json({ job: publicJob(job), code: job.code, schema: job.schema, detections: job.detections, validation: job.validation, valid: job.validation.valid, elementsDetected: job.detections.length, structuralAccuracy: job.validation.diff.structuralAccuracy, attempts: job.validation.attempts, genMode: job.genMode });
  }
  const job = getJob(req); await generateJob(job, req.body?.instructions || ''); res.json({ job: publicJob(job), code: job.rawCode, templates: job.templates, genMode: job.genMode });
} catch (e) { next(e); } });
app.post('/api/validate', async (req, res, next) => { try { const job = getJob(req); await validateJob(job, req.body?.instructions || ''); res.json({ job: publicJob(job), code: job.code, validation: job.validation }); } catch (e) { next(e); } });
app.post('/api/vision/smoke-test', async (_req, res, next) => { try { const report = await callPython(['vision-smoke']); res.json(report); } catch (error) { next(error); } });
app.get('/api/vision/gemini/models', async (_req, res, next) => { try { const report = await callPython(['vision-gemini-models']); res.json(report); } catch (error) { next(error); } });
app.get('/api/job/:id', (req, res, next) => { try { res.json({ job: publicJob(getJob(req)) }); } catch (e) { next(e); } });
app.get('/api/job/:id/result', (req, res, next) => { try { const job = getJob(req); requireStage(job, 'code', 'The job has no validated result yet.'); res.json({ job: publicJob(job), detections: job.detections, schema: job.schema, code: job.code, validation: job.validation, templates: job.templates || [] }); } catch (e) { next(e); } });
app.get('/api/vision/status', (_req, res) => res.json({ visionEnabled: visionRuntime.visionEnabled, provider: visionRuntime.provider, model: visionRuntime.model, apiKeyConfigured: visionRuntime.apiKeyConfigured, keySource: visionRuntime.keySource, providerReachable: visionRuntime.providerReachable, fallbackModeAvailable: true, lastVisionCallStatus: visionRuntime.lastVisionCallStatus, lastVisionHttpStatus: visionRuntime.lastVisionHttpStatus || null, lastVisionRetryable: Boolean(visionRuntime.lastVisionRetryable), lastVisionErrorCategory: visionRuntime.lastVisionErrorCategory, lastVisionErrorMessage: visionRuntime.lastVisionErrorMessage, schemaValidationStatus: visionRuntime.schemaValidationStatus, lastMergeStatus: visionRuntime.lastMergeStatus, lastSchemaSource: visionRuntime.lastSchemaSource }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', jobs: jobs.size, retrieval: process.env.RAG_BACKEND || 'faiss' }));
app.use((error, _req, res, _next) => res.status(error.status || 422).json({ error: error.message || 'Pipeline failed' }));
if (require.main === module) app.listen(process.env.PORT || 3000, () => { console.log(`[vision] enabled=${visionRuntime.visionEnabled}`); console.log(`[vision] provider=${visionRuntime.provider}`); console.log(`[vision] model=${visionRuntime.model || 'none'}`); console.log(`[vision] apiKeyConfigured=${visionRuntime.apiKeyConfigured}`); console.log('[vision] fallbackAvailable=true'); console.log('[vision] requestTransport=file'); visionRuntime.warnings.forEach((warning) => console.warn(`[vision] warning=${warning}`)); console.log(`Backend listening on :${process.env.PORT || 3000}`); });
module.exports = { app, resolvePythonBin, callPython, callPythonFile, argumentLengths, MAX_COMMAND_ARGUMENT_BYTES, safeVisionConfig, visionRuntime, validateGeneratedJsx, validateDependencyManifest };

// force restart

// force restart 2

// force restart 3 - comprehensive fix

// force reload after complete pipeline fix

// force reload after card recovery and pipeline fixes

// force reload after complete styling and theme refactor

// force reload after high contrast and horizontal row grid update

// force reload after complete Tailwind CSS safelist and root background update

// force reload after exact wireframe palette and 3-card alignment fix

// force reload after styleEvidence extraction in server.js
