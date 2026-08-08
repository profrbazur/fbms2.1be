import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { resetAndSeed, DEFAULT_PASSWORD } from '../utils/seedTestUsers.js';
import { disconnectTestDb } from '../utils/testDb.js';

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/auth/logout', () => {
  it('returns success with no token (Version 1 is client-side invalidation only)', async () => {
    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns success with a valid token too', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('does not attempt token revocation or refresh-token issuance', async () => {
    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.body.data).toEqual({});
  });
});
