/**
 * Shared by every service's list-endpoint pagination (`page`/`limit`
 * query params, always strings or `undefined` off the wire) — coerces
 * to a positive integer or falls back to the caller's default, instead
 * of each service redefining the identical two-line function.
 */
export function parsePositiveInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
