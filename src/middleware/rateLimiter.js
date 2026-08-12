import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { sendError } from '../utils/apiResponse.js';

const tooManyRequests = (message) => (req, res) => {
  sendError(res, { statusCode: 429, message, errors: [] });
};

// Skipped entirely in the automated test environment, mirroring the same
// `env.nodeEnv === 'test'` pattern app.js already uses for morgan. The
// test suite logs in dozens of times per file (tests/utils/authTokens.js)
// against the same in-process app/IP; a real limit here would throttle the
// suite itself, not a genuine client. Exercised directly in
// tests/middleware/rateLimiter.test.js instead.
const skip = () => env.nodeEnv === 'test';

/**
 * POST /api/v1/auth/login only. A password's keyspace is large enough that
 * per-IP throttling is sufficient friction against brute force. Keyed by
 * IP, so — unlike staffPinRateLimiter below — this bucket is shared by
 * every distinct user signing in from the same network, not just repeated
 * attempts on one account; a school lab/office network can easily produce
 * dozens of different real logins within 15 minutes. 100/15min was chosen
 * (over a tighter, more typical login-throttle value) specifically to
 * accommodate that shared-network pattern without locking out legitimate
 * users, while still being far below what a real brute-force attempt
 * needs.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: tooManyRequests('Too many login attempts. Please try again later.'),
});

/**
 * POST /api/v2/mobile/staff/login only. A PIN's keyspace is much smaller
 * than a password's, making this the higher-priority brute-force target.
 * Keyed by the already-authenticated device's own id (authenticateDevice
 * runs first on this router) rather than IP, so several kiosks sharing a
 * network don't trip each other's limit, and one device can't exhaust the
 * limit for every other kiosk.
 */
export const staffPinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => req.tablet?.id?.toString() || ipKeyGenerator(req),
  handler: tooManyRequests('Too many PIN attempts. Please try again later.'),
});
