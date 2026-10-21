'use strict';
// Integration: real Python CLI. Skipped (visibly) when no project venv exists.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const venvPython = path.join(__dirname, '../../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const available = Boolean(process.env.PYTHON_BIN) || fs.existsSync(venvPython);
if (!process.env.PYTHON_BIN && available) process.env.PYTHON_BIN = venvPython;

test('48KB generation payloads travel through files, not argv', { skip: !available && 'no Python venv (.venv) and no PYTHON_BIN' }, async () => {
  const { callPythonFile, MAX_COMMAND_ARGUMENT_BYTES } = require('../src/pipeline/python');
  const largeText = 'x'.repeat(48 * 1024);
  assert.ok(Buffer.byteLength(largeText) > MAX_COMMAND_ARGUMENT_BYTES);
  const schema = { type: 'root', id: 'root-0', children: [{ type: 'text', id: 'text-1', label: largeText, children: [] }] };
  const result = await callPythonFile('generate-file', 'long-payload-regression', { schema, errorReport: { notes: largeText }, instructions: 'blue '.repeat(300) }, { timeoutMs: 120_000 });
  assert.ok(typeof result.rawJsx === 'string' && result.rawJsx.length > 48 * 1024);
});

test('a stage that exceeds its timeout is killed and reported as stage_timeout', { skip: !available && 'no Python venv' }, async () => {
  const { callPython } = require('../src/pipeline/python');
  await assert.rejects(callPython(['vision-gemini-models'], { timeoutMs: 1 }), (error) => error.code === 'stage_timeout');
});

test('real pipeline on the landing fixture: compiles, validates structurally, no retries, catalog untouched', { skip: !available && 'no Python venv', timeout: 240_000 }, async () => {
  const crypto = require('crypto');
  const catalog = path.join(__dirname, '../../services/rag/vectors.sqlite3');
  const before = crypto.createHash('sha256').update(fs.readFileSync(catalog)).digest('hex');
  const saved = { VISION_ENABLED: process.env.VISION_ENABLED, VISION_PROVIDER: process.env.VISION_PROVIDER };
  Object.assign(process.env, { VISION_ENABLED: 'false', VISION_PROVIDER: 'disabled' }); // never call a provider from tests
  try {
    const { runPipeline } = require('../src/pipeline/pipeline');
    const stages = [];
    const result = await runPipeline(
      { id: 'it-landing', source_path: path.join(__dirname, '../../services/fixtures/uploads/landing-wireframe.jpeg'), instructions: 'Use a dark theme.' },
      { stageTimeoutMs: 180_000, onStage: async (stage) => stages.push(stage) },
    );
    assert.deepStrictEqual(stages, ['preprocess', 'detect', 'schema', 'generate', 'validate']);
    assert.strictEqual(result.status, 'complete');
    assert.strictEqual(result.validation.attempts, 0, 'deterministic template mode never regenerates');
    assert.strictEqual(result.validation.diff.structuralAccuracy, 1);
    assert.deepStrictEqual(result.validation.structuralViolations, []);
    assert.strictEqual(result.detectionMeta.vision.status, 'disabled');
    const preview = result.artifacts.find((a) => a.kind === 'preview-js');
    assert.ok(preview && preview.meta.componentName);
    assert.ok(!/\bimport\b/.test(preview.content));
  } finally {
    Object.assign(process.env, saved);
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  }
  const after = crypto.createHash('sha256').update(fs.readFileSync(catalog)).digest('hex');
  assert.strictEqual(after, before, 'RAG catalog must not be written at runtime');
});
