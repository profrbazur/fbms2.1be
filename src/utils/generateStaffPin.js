import crypto from 'node:crypto';

const PIN_MIN = 0;
const PIN_MAX = 999999;
const PIN_LENGTH = 6;

/**
 * Generates a random 6-digit Staff PIN (e.g. "004821") using
 * crypto.randomInt's uniform rejection sampling — the same reasoning as
 * generateActivationToken.js. Server-generated only: the approved V2.4
 * workflow never accepts a client-chosen PIN value (see
 * backend/docs/v2/V2_4_STAFF_PIN_SERVICE_SESSION.md's "exactly 6 digits"
 * requirement).
 */
export function generateStaffPin() {
  const value = crypto.randomInt(PIN_MIN, PIN_MAX + 1);
  return String(value).padStart(PIN_LENGTH, '0');
}
