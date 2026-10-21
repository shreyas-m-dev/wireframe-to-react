/**
 * API client. Attaches the Supabase access token as a bearer token, retries
 * once after refreshing an expired session, and turns every failure into an
 * ApiError with a stable `code` and a message that is safe to display.
 */

export class ApiError extends Error {
  constructor(status, code, message, { requestId = null, retryAfter = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

const AUTH_FAILURES = new Set(['unauthenticated', 'session_expired', 'session_revoked']);

export function createApiClient({ getAccessToken, refreshSession, onUnauthenticated, baseUrl = '', fetchImpl = (...args) => fetch(...args) }) {
  async function send(path, { method = 'GET', json, form, signal, headers = {}, as = 'json' }, token) {
    const init = { method, signal, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (form) init.body = form;
    else if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] = 'application/json'; }
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.');
    }
    if (response.ok) {
      if (response.status === 204) return null;
      if (as === 'blob') return response.blob();
      return response.json();
    }
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON error page (proxy, gateway) */ }
    const error = body?.error || {};
    throw new ApiError(
      response.status,
      error.code || `http_${response.status}`,
      error.message || (response.status >= 500 ? 'The server had a problem. Try again shortly.' : 'The request could not be completed.'),
      { requestId: error.requestId || response.headers.get('x-request-id'), retryAfter: Number(response.headers.get('retry-after')) || null },
    );
  }

  return async function request(path, options = {}) {
    const token = await getAccessToken();
    try {
      return await send(path, options, token);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || !AUTH_FAILURES.has(error.code)) throw error;
      // One refresh attempt covers the common "token expired while the tab slept" case.
      if (error.code === 'session_expired' || error.code === 'unauthenticated') {
        const fresh = await refreshSession().catch(() => null);
        if (fresh && fresh !== token) {
          try { return await send(path, options, fresh); } catch (retryError) { if (!(retryError instanceof ApiError) || retryError.status !== 401) throw retryError; }
        }
      }
      onUnauthenticated?.(error.code);
      throw error;
    }
  };
}

/** Human-readable error text for an ApiError (or anything else). */
export function describeError(error) {
  if (!error) return '';
  if (error instanceof ApiError) {
    const ref = error.status >= 500 && error.requestId ? ` (reference ${error.requestId})` : '';
    return `${error.message}${ref}`;
  }
  return 'Something went wrong. Try again.';
}
