'use strict';

/**
 * Structured JSON-lines logger. Fields whose names look secret are redacted
 * before serialisation, as a backstop against accidental credential logging.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SECRET_KEY = /pass(word)?|secret|token|authorization|api[_-]?key|cookie|database_?url/i;

function scrub(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : scrub(item, depth + 1)]));
}

function createLogger({ level = process.env.LOG_LEVEL || 'info', write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const log = (lvl) => (event, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    write(JSON.stringify({ time: new Date().toISOString(), level: lvl, event, ...scrub(fields) }));
  };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

module.exports = { createLogger };
