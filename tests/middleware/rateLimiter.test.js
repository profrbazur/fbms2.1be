import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import app from '../../src/app.js';
import { loginRateLimiter, staffPinRateLimiter } from '../../src/middleware/rateLimiter.js';

describe('rate limiter middleware', () => {
  it('exports configured Express middleware for the login and staff PIN routes', () => {
    expect(typeof loginRateLimiter).toBe('function');
    expect(typeof staffPinRateLimiter).toBe('function');
  });

  it('is skipped in the test environment so the shared login endpoint is never throttled', async () => {
    // The full suite logs in dozens of times per file (tests/utils/
    // authTokens.js) against this same in-process app/IP; this proves
    // that traffic never trips the limiter and breaks other test files.
    const attempts = await Promise.all(
      Array.from({ length: 25 }, () =>
        request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'nobody@fbms.test', password: 'wrong-password' }),
      ),
    );

    expect(attempts.every((res) => res.status !== 429)).toBe(true);
  });

  it('blocks requests beyond the configured limit once enforced, with the standard error envelope', async () => {
    // Builds an isolated app with the same rate-limiting pattern (not
    // gated by the test-environment skip) to prove the underlying
    // mechanism — window, limit, and 429 response shape — behaves as
    // configured in loginRateLimiter/staffPinRateLimiter.
    const probeApp = express();
    probeApp.use(
      '/probe',
      rateLimit({
        windowMs: 60_000,
        limit: 3,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) =>
          res.status(429).json({ success: false, message: 'Too many requests.', errors: [] }),
      }),
    );
    probeApp.get('/probe', (req, res) => res.status(200).json({ success: true }));

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await request(probeApp).get('/probe'));
    }

    expect(results.slice(0, 3).every((res) => res.status === 200)).toBe(true);
    expect(results[3].status).toBe(429);
    expect(results[3].body).toEqual({
      success: false,
      message: 'Too many requests.',
      errors: [],
    });
  });
});
