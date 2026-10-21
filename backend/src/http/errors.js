'use strict';

/**
 * Error model. Routes throw HttpError with a stable machine `code` and a
 * user-safe message. Anything else becomes a generic 500 whose details go to
 * the log only, referenced by request id.
 */

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);

function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, _next) => {
    let status = 500;
    let code = 'internal_error';
    let message = `Something went wrong. Reference: ${req.id}`;
    let extra = {};

    if (error instanceof HttpError) {
      ({ status, code, message, extra } = error);
    } else if (error && error.name === 'MulterError') {
      status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code = error.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_upload';
      message = error.code === 'LIMIT_FILE_SIZE' ? 'The file is too large.' : 'The upload could not be processed. Send one image in the "wireframe" field.';
    } else if (error && error.type === 'entity.parse.failed') {
      status = 400; code = 'invalid_json'; message = 'The request body is not valid JSON.';
    } else if (error && error.type === 'entity.too.large') {
      status = 413; code = 'payload_too_large'; message = 'The request body is too large.';
    }

    if (status >= 500) logger.error('http.unhandled_error', { requestId: req.id, method: req.method, path: req.path, message: error?.message, stack: error?.stack });
    else logger.info('http.client_error', { requestId: req.id, status, code });

    if (res.headersSent) return;
    if (status === 401) res.set('WWW-Authenticate', `Bearer error="${code === 'session_expired' ? 'invalid_token' : code}"`);
    if (extra.retryAfterSec) res.set('Retry-After', String(extra.retryAfterSec));
    res.status(status).json({ error: { code, message, requestId: req.id } });
  };
}

module.exports = { HttpError, notFound, errorHandler };
