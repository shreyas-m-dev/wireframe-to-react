'use strict';
// Windows regression: generation payloads must travel through files, not argv.
const assert = require('assert');
const path = require('path');
process.env.PYTHON_BIN = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
const { callPythonFile, argumentLengths, MAX_COMMAND_ARGUMENT_BYTES } = require('./server');

async function main() {
  const largeText = 'x'.repeat(48 * 1024);
  const schema = { type: 'root', id: 'root-0', children: [{ type: 'text', id: 'text-1', label: largeText, children: [] }] };
  assert(argumentLengths([JSON.stringify(schema)])[0].bytes > MAX_COMMAND_ARGUMENT_BYTES, 'fixture must exceed argv guard');
  const result = await callPythonFile('generate-file', 'long-payload-regression', { schema, errorReport: { notes: largeText }, instructions: 'blue '.repeat(300) });
  assert(typeof result.rawJsx === 'string' && result.rawJsx.length > 48 * 1024, 'file transport did not return generated JSX');
  console.log('PASS: 48KB schema/code payload uses short file-path arguments');
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
