'use strict';

/**
 * Bounded calls into scripts/cli_pipeline.py.
 *
 * - execFile only (no shell), arguments length-checked (Windows argv limit).
 * - Every call has a timeout and an AbortSignal; the child is killed on either.
 * - The child gets an allow-listed environment: pipeline/provider settings
 *   pass through, while API secrets such as DATABASE_URL never reach Python.
 * - Python's error text is classified into a user-safe message; the raw text
 *   is kept on the error for logs only.
 */

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolvePythonBin, WINDOWS_STUB_MARKER, _resetCache } = require('./python_resolver');

const CLI = path.join(__dirname, '../../../scripts/cli_pipeline.py');
const MAX_COMMAND_ARGUMENT_BYTES = 8192;
const RUNTIME_ROOT = path.join(os.tmpdir(), 'w2r');

const ENV_ALLOW = [
  /^PATH$/i, /^PATHEXT$/i, /^SYSTEMROOT$/i, /^SYSTEMDRIVE$/i, /^WINDIR$/i, /^COMSPEC$/i, /^TEMP$/i, /^TMP$/i, /^TMPDIR$/,
  /^HOME$/, /^USERPROFILE$/i, /^APPDATA$/i, /^LOCALAPPDATA$/i, /^LANG$/, /^LC_/, /^NUMBER_OF_PROCESSORS$/i, /^PROCESSOR_/i,
  /^PYTHON/, /^TESSERACT_CMD$/, /^TESSDATA_PREFIX$/, /^OMP_NUM_THREADS$/, /^HF_/, /^TRANSFORMERS_/, /^SENTENCE_TRANSFORMERS_/,
  /^GEN_MODE$/, /^RAG_/, /^VECTOR_BACKEND$/, /^VISION_/, /^GEMINI_/, /^OPENAI_API_KEY$/, /^ANTHROPIC_API_KEY$/, /^LLM_/, /^OPENROUTER_/,
];

function childEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => ENV_ALLOW.some((re) => re.test(key))));
}

class PipelineError extends Error {
  /** @param code machine code  @param userMessage safe to show  @param detail internal (logs only) */
  constructor(code, userMessage, detail) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

/** Maps raw Python error text to a message that never contains paths or internals. */
function classifyPythonError(raw) {
  const text = String(raw || '');
  if (/^Invalid image:/i.test(text) || /could not be decoded|Empty file|invalid dimensionality|too small|aspect ratio/i.test(text)) {
    return new PipelineError('invalid_image', 'The image could not be processed. Upload a PNG, JPEG, WebP or BMP wireframe of at least 200×200 pixels.', text);
  }
  if (/^No UI elements detected/i.test(text)) {
    return new PipelineError('nothing_detected', 'No interface elements were found. Try a wireframe with clearer outlines or readable text.', text);
  }
  if (/^(File not found|Could not decode image)/i.test(text)) {
    return new PipelineError('invalid_image', 'The image could not be read.', text);
  }
  if (/Windows Store stub|Couldn't find a working Python/i.test(text)) {
    return new PipelineError('pipeline_unavailable', 'The processing service is not available right now.', text);
  }
  return new PipelineError('pipeline_failed', 'Processing failed at this stage.', text);
}

function assertShortArguments(args) {
  args.forEach((value, index) => {
    const bytes = Buffer.byteLength(String(value), 'utf8');
    if (bytes > MAX_COMMAND_ARGUMENT_BYTES) throw new Error(`Internal transport guard: argument ${index} is ${bytes} bytes. Use file transport.`);
  });
}

function run(args, { timeoutMs, signal, maxBuffer = 15 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    try { assertShortArguments(args); } catch (error) { reject(error); return; }
    let pythonBin;
    try { pythonBin = resolvePythonBin(); } catch (error) { reject(classifyPythonError(error.message)); return; }
    execFile(pythonBin, [CLI, ...args], { maxBuffer, timeout: timeoutMs, killSignal: 'SIGKILL', signal, env: childEnv(), windowsHide: true }, (error, stdout, stderr) => {
      if (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
      if (stdout.includes(WINDOWS_STUB_MARKER)) { _resetCache(); reject(classifyPythonError('Windows Store stub')); return; }
      if (error && error.killed && !signal?.aborted) { reject(new PipelineError('stage_timeout', 'This stage took too long and was stopped.', `timeout after ${timeoutMs}ms`)); return; }
      if (error) {
        let message = stderr || error.message;
        try { message = JSON.parse(stderr).error; } catch { /* plain stderr */ }
        reject(classifyPythonError(message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function callPython(args, options) {
  const stdout = await run(args, options);
  try { return JSON.parse(stdout); } catch { throw new PipelineError('pipeline_failed', 'Processing returned an unreadable result.', stdout.slice(0, 500)); }
}

/** Large payloads travel through files in a per-job runtime directory, not argv. */
async function callPythonFile(subcommand, jobId, payload, options) {
  const safeJobId = String(jobId || crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const directory = runtimeDir(safeJobId);
  fs.mkdirSync(directory, { recursive: true });
  const input = path.join(directory, `${subcommand}-input.json`);
  const output = path.join(directory, `${subcommand}-output.json`);
  fs.writeFileSync(input, JSON.stringify(payload), 'utf8');
  await run([subcommand, input, output], { ...options, maxBuffer: 1024 * 1024 });
  try { return JSON.parse(fs.readFileSync(output, 'utf8')); } catch (error) { throw new PipelineError('pipeline_failed', 'Processing returned an unreadable result.', error.message); }
}

function runtimeDir(jobId) {
  return path.join(RUNTIME_ROOT, String(jobId).replace(/[^a-zA-Z0-9-]/g, ''));
}

function removeRuntimeDir(jobId) {
  fs.rmSync(runtimeDir(jobId), { recursive: true, force: true });
}

module.exports = { callPython, callPythonFile, removeRuntimeDir, classifyPythonError, PipelineError, childEnv, MAX_COMMAND_ARGUMENT_BYTES, assertShortArguments };
