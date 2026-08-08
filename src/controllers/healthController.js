/**
 * The health endpoint intentionally returns `version` as a top-level field
 * (per the exact response body specified for this endpoint) rather than
 * nested under `data` as in the general ARCHITECTURE.md success envelope.
 * This is a documented, endpoint-specific exception, not a change to the
 * standard response contract used by all other endpoints.
 */
export function getHealth(req, res) {
  return res.status(200).json({
    success: true,
    message: 'FBMS API is running.',
    version: '1.0.0',
  });
}
