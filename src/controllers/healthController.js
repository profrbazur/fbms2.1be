import mongoose from 'mongoose';

/**
 * The health endpoint intentionally returns `version` as a top-level field
 * (per the exact response body specified for this endpoint) rather than
 * nested under `data` as in the general ARCHITECTURE.md success envelope.
 * This is a documented, endpoint-specific exception, not a change to the
 * standard response contract used by all other endpoints.
 *
 * Reports Mongoose's own connection state rather than issuing a live query,
 * so this stays a cheap liveness/readiness check — no credentials or host
 * details are exposed either way.
 */
export function getHealth(req, res) {
  const dbConnected = mongoose.connection.readyState === 1;

  return res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected
      ? 'FBMS API is running.'
      : 'FBMS API is running but the database is unreachable.',
    version: '1.0.0',
  });
}
