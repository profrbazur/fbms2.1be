import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const sync = (headers, body) => request(app).post('/api/v1/mobile/sync').set(headers ?? {}).send(body ?? {});

let deviceSecret;

beforeAll(async () => {
  await resetAndSeed();
  ({ deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/mobile/sync (Version 1 stub contract)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await sync(undefined, {});
    expect(res.status).toBe(401);
  });

  it('rejects an unknown field with 400', async () => {
    const res = await sync(deviceAuthHeader(deviceSecret), { unexpected: true });
    expect(res.status).toBe(400);
  });

  it('rejects a non-array pendingFeedback with 400', async () => {
    const res = await sync(deviceAuthHeader(deviceSecret), { pendingFeedback: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('acknowledges an empty request with the documented stub response', async () => {
    const res = await sync(deviceAuthHeader(deviceSecret), {});

    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(0);
    expect(typeof res.body.data.syncedAt).toBe('string');
  });

  it('acknowledges a request with pendingFeedback without processing it (no queue reconciliation in V1)', async () => {
    const res = await sync(deviceAuthHeader(deviceSecret), {
      pendingFeedback: [{ surveyId: 'x', answers: [] }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(0);
  });
});
