import crypto from 'node:crypto';

// Excludes visually ambiguous characters (0/O, 1/I) since this token is
// meant to be manually typed on a physical tablet during activation.
const TOKEN_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH = 8;

/**
 * Generates a TAB-XXXXXXXX activation token using crypto.randomInt, which
 * performs rejection sampling internally (unlike `% charset.length` on
 * crypto.randomBytes) so every character is drawn from a uniform
 * distribution — appropriate for a device-pairing secret.
 */
export function generateActivationToken() {
  let suffix = '';
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    suffix += TOKEN_CHARSET[crypto.randomInt(TOKEN_CHARSET.length)];
  }
  return `TAB-${suffix}`;
}
