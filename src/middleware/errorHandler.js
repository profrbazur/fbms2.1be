import { env } from '../config/env.js';
import { sendError } from '../utils/apiResponse.js';

/**
 * Centralized Express error handler. Must be registered last, after all
 * routes. Never exposes internal stack traces to the client.
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Internal server error.';
  const errors = err.errors || [];

  if (env.nodeEnv !== 'test') {
    console.error(err);
  }

  return sendError(res, { statusCode, message, errors });
}
