import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectTestDb, disconnectTestDb } from './utils/testDb.js';

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with the documented response body when the database is connected', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'FBMS API is running.',
      version: '1.0.0',
    });
  });

  it('includes Helmet security headers', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('returns 503 when the database connection is not ready', async () => {
    await mongoose.disconnect();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/database/i);

    // Restore so later test files' beforeAll (connectTestDb/resetAndSeed)
    // start from a clean, known connection state.
    await connectTestDb();
  });
});
