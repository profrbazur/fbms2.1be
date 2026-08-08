/**
 * Standard success/error response envelopes per docs/ARCHITECTURE.md.
 */

export function sendSuccess(res, { statusCode = 200, message = 'Request completed successfully.', data = {} } = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(res, { statusCode = 500, message = 'An unexpected error occurred.', errors = [] } = {}) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}
