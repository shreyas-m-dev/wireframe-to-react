'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { requestId, accessLog, apiSecurityHeaders, corsPolicy, requireAuth, limiter } = require('./http/middleware');
const { errorHandler, HttpError } = require('./http/errors');
const { createApiRouter } = require('./routes/api');

/**
 * Builds the Express app from injected dependencies:
 *   { config, db, repos, runner, blobs, logger, verifyAccessToken, assertSessionActive }
 */
function createApp(deps) {
  const { config, db, logger, verifyAccessToken, assertSessionActive } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestId());
  app.use(accessLog(logger));

  const api = express.Router();
  api.use(apiSecurityHeaders());
  api.use(corsPolicy(config.corsOrigins));
  api.use(limiter({ windowMs: 60_000, limit: 300 })); // per-IP flood guard before any token work
  api.use(express.json({ limit: '32kb' }));

  // Public probes: liveness never touches dependencies; readiness checks the DB.
  api.get('/health', (_req, res) => res.json({ status: 'ok' }));
  api.get('/ready', async (_req, res) => {
    try {
      await db.ping();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  api.use(requireAuth({ verifyAccessToken, assertSessionActive }));
  api.use(createApiRouter(deps));
  app.use('/api', api);

  if (config.frontendDist) mountFrontend(app, config);

  app.use((req, _res, next) => next(new HttpError(404, 'not_found', 'Not found.')));
  app.use(errorHandler(logger));
  return app;
}

/** Serves the built SPA (single-container deployments) with a strict CSP. */
function mountFrontend(app, config) {
  const dist = config.frontendDist;
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`FRONTEND_DIST has no index.html: ${dist}`);
  const supabase = new URL(config.supabaseUrl).origin;

  // The preview frame carries its own CSP <meta> (sandboxed, opaque origin);
  // it may only be framed by this app.
  app.get('/preview-frame.html', helmet({ contentSecurityPolicy: false, frameguard: { action: 'sameorigin' }, crossOriginEmbedderPolicy: false }), (_req, res) => {
    res.set('Content-Security-Policy', "frame-ancestors 'self'");
    res.sendFile(path.join(dist, 'preview-frame.html'));
  });

  const appCsp = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'blob:', 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", supabase],
        frameSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    strictTransportSecurity: config.production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  app.use(appCsp, express.static(dist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, file) => { if (file.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
  app.get(/^\/(?!api\/).*/, appCsp, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}

module.exports = { createApp };
