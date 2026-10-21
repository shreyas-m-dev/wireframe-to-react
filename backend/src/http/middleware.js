'use strict';

const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('./errors');
const { AuthError } = require('../auth/supabase');

const AUTH_MESSAGES = {
  session_expired: 'Your session has expired. Sign in again.',
  session_revoked: 'Your session has ended. Sign in again.',
  auth_unavailable: 'Sign-in could not be verified right now. Try again shortly.',
};

function requestId() {
  return (req, res, next) => {
    const incoming = req.get('X-Request-Id');
    req.id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  };
}

function accessLog(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('http.request', {
        requestId: req.id,
        method: req.method,
        path: req.route ? `${req.baseUrl}${req.route.path}` : req.path, // route pattern: no ids in logs
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
        userId: req.user?.userId,
      });
    });
    next();
  };
}

function apiSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}

function corsPolicy(allowedOrigins) {
  const allow = new Set(allowedOrigins);
  return cors({
    origin(origin, callback) {
      // Same-origin and non-browser requests send no Origin header.
      if (!origin || allow.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'Content-Disposition'],
    credentials: false, // bearer tokens only; no ambient cookies
    maxAge: 600,
  });
}

/**
 * Bearer-token authentication. Verifies the Supabase JWT and, when enabled,
 * that its session is still live. Attaches req.user = { userId, email, sessionId }.
 */
function requireAuth({ verifyAccessToken, assertSessionActive }) {
  return async (req, _res, next) => {
    try {
      const header = req.get('Authorization') || '';
      const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header);
      if (!match) throw new HttpError(401, 'unauthenticated', 'Sign in to continue.');
      const user = await verifyAccessToken(match[1]);
      if (assertSessionActive) await assertSessionActive(user);
      req.user = user;
      next();
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      if (error instanceof AuthError) {
        const status = error.code === 'auth_unavailable' ? 503 : 401;
        const code = error.code === 'invalid_token' ? 'unauthenticated' : error.code;
        return next(new HttpError(status, code, AUTH_MESSAGES[error.code] || 'Sign in to continue.'));
      }
      return next(error);
    }
  };
}

function requireAdmin(adminUserIds) {
  return (req, _res, next) => {
    if (!req.user || !adminUserIds.has(req.user.userId)) return next(new HttpError(403, 'forbidden', 'You do not have access to this resource.'));
    next();
  };
}

function limiter({ windowMs, limit, keyByUser = false, code = 'rate_limited' }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (keyByUser && req.user ? `u:${req.user.userId}` : `ip:${req.ip}`),
    handler: (req, _res, next, options) => next(new HttpError(429, code, 'Too many requests. Slow down and try again shortly.', { retryAfterSec: Math.ceil(options.windowMs / 1000) })),
  });
}

module.exports = { requestId, accessLog, apiSecurityHeaders, corsPolicy, requireAuth, requireAdmin, limiter };
