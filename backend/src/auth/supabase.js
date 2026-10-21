'use strict';

/**
 * Supabase Auth integration for the API.
 *
 * The browser signs in with supabase-js and sends the access token as
 * `Authorization: Bearer <jwt>`. This module:
 *   1. verifies the JWT signature, issuer, audience, expiry and role with
 *      `jose` — against the project's JWKS (asymmetric signing keys, the
 *      Supabase default) or, for legacy projects, the shared HS256 secret;
 *   2. optionally confirms the session still exists in auth.sessions and the
 *      user is confirmed, not banned and not deleted. This is what makes
 *      sign-out and account bans take effect before the token expires.
 */

const { createRemoteJWKSet, jwtVerify, errors: joseErrors } = require('jose');
const { UUID } = require('../config');

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function createTokenVerifier({ supabaseUrl, jwtSecret = null, keySet = null, clockToleranceSec = 5 }) {
  const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  let key;
  let algorithms;
  if (keySet) {
    key = keySet; // injected (tests)
    algorithms = ['ES256', 'RS256', 'EdDSA'];
  } else if (jwtSecret) {
    key = new TextEncoder().encode(jwtSecret);
    algorithms = ['HS256'];
  } else {
    key = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000, timeoutDuration: 5_000 });
    algorithms = ['ES256', 'RS256', 'EdDSA'];
  }

  return async function verifyAccessToken(token) {
    if (typeof token !== 'string' || token.length > 8192 || token.split('.').length !== 3) throw new AuthError('invalid_token', 'Malformed token');
    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, { issuer, audience: 'authenticated', algorithms, clockTolerance: clockToleranceSec, requiredClaims: ['sub', 'exp', 'iat'] }));
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) throw new AuthError('session_expired', 'Token expired');
      if (error instanceof joseErrors.JWKSTimeout || error?.code === 'ERR_JOSE_GENERIC' && /fetch/i.test(error.message)) throw new AuthError('auth_unavailable', 'Signing keys unavailable');
      throw new AuthError('invalid_token', 'Token verification failed');
    }
    // Only end-user tokens are accepted: never anon/service_role keys, never anonymous users.
    if (payload.role !== 'authenticated') throw new AuthError('invalid_token', 'Unexpected role');
    if (payload.is_anonymous === true) throw new AuthError('invalid_token', 'Anonymous sessions are not accepted');
    if (!UUID.test(String(payload.sub))) throw new AuthError('invalid_token', 'Invalid subject');
    if (payload.session_id !== undefined && !UUID.test(String(payload.session_id))) throw new AuthError('invalid_token', 'Invalid session id');
    return {
      userId: String(payload.sub).toLowerCase(),
      email: typeof payload.email === 'string' ? payload.email : null,
      sessionId: payload.session_id ? String(payload.session_id).toLowerCase() : null,
      expiresAt: payload.exp,
    };
  };
}

/**
 * Confirms the token's session is still live. Positive results are cached for
 * `cacheMs` (default 30 s), which bounds how long a signed-out token keeps
 * working. Negative results are never cached.
 */
function createSessionChecker(db, { cacheMs = 30_000, maxEntries = 10_000 } = {}) {
  const cache = new Map();
  return async function assertSessionActive({ userId, sessionId }) {
    if (!sessionId) throw new AuthError('invalid_token', 'Token has no session');
    const now = Date.now();
    const cached = cache.get(sessionId);
    if (cached && cached.userId === userId && cached.until > now) return;
    const { rows } = await db.query(
      `select 1 from auth.sessions s join auth.users u on u.id = s.user_id
        where s.id = $1 and s.user_id = $2
          and (s.not_after is null or s.not_after > now())
          and u.deleted_at is null
          and (u.banned_until is null or u.banned_until <= now())
          and u.email_confirmed_at is not null
          and coalesce(u.is_anonymous, false) = false`,
      [sessionId, userId],
    );
    if (!rows.length) { cache.delete(sessionId); throw new AuthError('session_revoked', 'Session is no longer active'); }
    if (cacheMs > 0) {
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
      cache.set(sessionId, { userId, until: now + cacheMs });
    }
  };
}

module.exports = { createTokenVerifier, createSessionChecker, AuthError };
