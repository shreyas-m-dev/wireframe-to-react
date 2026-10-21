'use strict';

/**
 * Production entrypoint: validate config → connect DB → check migrations →
 * recover interrupted jobs → listen. SIGTERM/SIGINT drain gracefully.
 */

const { loadConfig, ConfigError } = require('./src/config');
const { createLogger } = require('./src/logger');
const { createPgDatabase } = require('./src/db');
const { assertUpToDate } = require('./src/db/migrate');
const { createRepositories } = require('./src/db/repositories');
const { createTokenVerifier, createSessionChecker } = require('./src/auth/supabase');
const { JobRunner } = require('./src/jobs/runner');
const { runPipeline } = require('./src/pipeline/pipeline');
const { createBlobStore } = require('./src/uploads');
const { createApp } = require('./src/app');

async function main() {
  const logger = createLogger();
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) { console.error(error.message); process.exit(1); }
    throw error;
  }

  const db = createPgDatabase(config, logger);
  await db.ping();
  await assertUpToDate(db);
  const repos = createRepositories(db);
  const interrupted = await repos.jobs.failInterruptedInternal();
  if (interrupted.length) logger.warn('jobs.recovered_interrupted', { count: interrupted.length });

  const runner = new JobRunner({
    repos, runPipeline, logger,
    maxConcurrent: config.maxConcurrentJobs,
    maxQueued: config.maxQueuedJobs,
    stageTimeoutMs: config.stageTimeoutMs,
    genMode: config.genMode,
  });
  const app = createApp({
    config, db, repos, runner, logger,
    blobs: createBlobStore(config.dataDir),
    verifyAccessToken: createTokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.supabaseJwtSecret }),
    assertSessionActive: config.authSessionCheck ? createSessionChecker(db, { cacheMs: config.authSessionCacheMs }) : null,
  });

  const server = app.listen(config.port, () => {
    logger.info('server.listening', {
      port: config.port, env: config.nodeEnv, genMode: config.genMode,
      visionEnabled: String(process.env.VISION_ENABLED || 'false').toLowerCase() === 'true',
      sessionCheck: config.authSessionCheck, servesFrontend: Boolean(config.frontendDist),
    });
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 20_000;

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info('server.shutdown', { signal });
    server.close();
    await runner.shutdown(15_000);
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error(JSON.stringify({ time: new Date().toISOString(), level: 'error', event: 'server.boot_failed', message: error.message }));
  process.exit(1);
});
