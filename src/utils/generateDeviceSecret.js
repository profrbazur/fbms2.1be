import crypto from 'node:crypto';

const SECRET_BYTES = 32;

/**
 * Generates a Device Secret — the tablet's permanent mobile credential
 * (P5.1), returned to the Android client exactly once at activation
 * time and never displayed again. 256 bits of crypto.randomBytes
 * entropy, base64url-encoded for safe transport in a header.
 */
export function generateDeviceSecret() {
  return `dvc_${crypto.randomBytes(SECRET_BYTES).toString('base64url')}`;
}

/**
 * SHA-256, not bcrypt: unlike a human-chosen User password, a Device
 * Secret already carries 256 bits of uniform entropy, so bcrypt's
 * deliberately-slow, salted hashing defends against a threat (low-
 * entropy dictionary/brute-force attacks) that doesn't apply here. A
 * plain deterministic hash lets authenticateDevice.js look a tablet up
 * directly by `deviceSecretHash` (an indexed exact-match query) instead
 * of the fetch-candidate-then-compare pattern bcrypt would require —
 * important for a value checked on every mobile request, including
 * frequent heartbeats. See docs/DECISIONS.md.
 */
export function hashDeviceSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
