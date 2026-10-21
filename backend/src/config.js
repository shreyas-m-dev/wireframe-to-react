'use strict';

/**
 * Reads and validates environment configuration once at boot. Invalid or
 * missing required values stop the process with a list of every problem,
 * naming variables but never echoing their values.
 */

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

function list(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function loadConfig(env = process.env) {
  const problems = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';

  const int = (name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (env[name] === undefined || env[name] === '') return fallback;
    const value = Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${name} must be an integer between ${min} and ${max}`);
      return fallback;
    }
    return value;
  };
  const bool = (name, fallback) => {
    if (env[name] === undefined || env[name] === '') return fallback;
    const value = String(env[name]).toLowerCase();
    if (value !== 'true' && value !== 'false') { problems.push(`${name} must be true or false`); return fallback; }
    return value === 'true';
  };

  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!supabaseUrl) problems.push('SUPABASE_URL is required');
  else {
    try {
      const url = new URL(supabaseUrl);
      if (production && url.protocol !== 'https:') problems.push('SUPABASE_URL must use https in production');
    } catch { problems.push('SUPABASE_URL must be a valid URL'); }
  }

  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (!databaseUrl) problems.push('DATABASE_URL is required');

  const databaseSsl = String(env.DATABASE_SSL || (production ? 'verify' : 'require')).toLowerCase();
  if (!['verify', 'require', 'disable'].includes(databaseSsl)) problems.push('DATABASE_SSL must be verify, require or disable');
  if (databaseSsl === 'verify' && !env.DATABASE_SSL_CA) problems.push('DATABASE_SSL_CA (path to the Supabase CA certificate) is required when DATABASE_SSL=verify');
  if (production && databaseSsl === 'disable') problems.push('DATABASE_SSL=disable is not allowed in production');

  const corsOrigins = list(env.CORS_ORIGINS || (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173'));
  if (production && corsOrigins.length === 0) problems.push('CORS_ORIGINS is required in production');
  for (const origin of corsOrigins) {
    try { if (new URL(origin).origin !== origin) problems.push(`CORS_ORIGINS entry must be a bare origin (scheme://host[:port]): ${origin}`); }
    catch { problems.push(`CORS_ORIGINS entry is not a valid origin: ${origin}`); }
  }

  const adminUserIds = list(env.ADMIN_USER_IDS);
  if (adminUserIds.some((id) => !UUID.test(id))) problems.push('ADMIN_USER_IDS must be a comma-separated list of Supabase user UUIDs');

  const trustProxyRaw = String(env.TRUST_PROXY || 'false').toLowerCase();
  let trustProxy = false;
  if (trustProxyRaw === 'true') problems.push('TRUST_PROXY=true trusts every hop and lets clients spoof their IP; set the number of proxies (e.g. 1) instead');
  else if (/^\d+$/.test(trustProxyRaw)) trustProxy = Number(trustProxyRaw);
  else if (trustProxyRaw !== 'false') trustProxy = trustProxyRaw; // e.g. "loopback" or a subnet list

  const config = {
    nodeEnv,
    production,
    port: int('PORT', 3000, { max: 65535 }),
    supabaseUrl,
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET || null,
    authSessionCheck: bool('AUTH_SESSION_CHECK', true),
    authSessionCacheMs: int('AUTH_SESSION_CACHE_MS', 30_000, { min: 0, max: 300_000 }),
    databaseUrl,
    databaseSsl,
    databaseSslCa: env.DATABASE_SSL_CA || null,
    databasePoolMax: int('DATABASE_POOL_MAX', 5, { max: 50 }),
    corsOrigins,
    trustProxy,
    adminUserIds: new Set(adminUserIds.map((id) => id.toLowerCase())),
    dataDir: path.resolve(REPO_ROOT, env.DATA_DIR || 'data'),
    maxUploadBytes: int('MAX_UPLOAD_BYTES', 15 * 1024 * 1024, { min: 1024, max: 50 * 1024 * 1024 }),
    maxConcurrentJobs: int('MAX_CONCURRENT_JOBS', 2, { max: 16 }),
    maxQueuedJobs: int('MAX_QUEUED_JOBS', 20, { max: 1000 }),
    maxActiveJobsPerUser: int('MAX_ACTIVE_JOBS_PER_USER', 2, { max: 50 }),
    jobsPerHourPerUser: int('JOBS_PER_HOUR_PER_USER', 30, { max: 10_000 }),
    stageTimeoutMs: int('PIPELINE_STAGE_TIMEOUT_MS', 180_000, { min: 5_000, max: 1_800_000 }),
    genMode: String(env.GEN_MODE || 'template').toLowerCase(),
    frontendDist: env.FRONTEND_DIST ? path.resolve(REPO_ROOT, env.FRONTEND_DIST) : null,
  };
  if (!['template', 'llm'].includes(config.genMode)) problems.push('GEN_MODE must be template or llm');

  if (problems.length) throw new ConfigError(problems);
  return config;
}

module.exports = { loadConfig, ConfigError, REPO_ROOT, UUID };
