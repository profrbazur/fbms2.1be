import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getConfig = (headers) => request(app).get('/api/v1/mobile/config').set(headers ?? {});

let deviceSecret;

beforeAll(async () => {
  await resetAndSeed();
  ({ deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/mobile/config', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getConfig();
    expect(res.status).toBe(401);
  });

  it('returns exactly the documented minimal fields', async () => {
    const res = await getConfig(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data.config).sort()).toEqual(
      [
        'systemName',
        'logoUrl',
        'primaryColor',
        'secondaryColor',
        'heartbeatIntervalSeconds',
        'minAppVersion',
        'feedbackSessionTimeoutSeconds',
      ].sort(),
    );
  });

  it('reflects the current OrganizationSettings values', async () => {
    const res = await getConfig(deviceAuthHeader(deviceSecret));

    expect(res.body.data.config.systemName).toBe('Feedback Management System Demo University');
    expect(res.body.data.config.primaryColor).toBe('#002E1F');
    expect(res.body.data.config.heartbeatIntervalSeconds).toBe(300);
    expect(res.body.data.config.minAppVersion).toBe('1.0.0');
    // P8.0 — Settings' "Feedback Session Timeout", exposed for the
    // Android client to read alongside the other mobile-facing settings.
    expect(res.body.data.config.feedbackSessionTimeoutSeconds).toBe(120);
  });

  it('does not expose unnecessary administrative data', async () => {
    const res = await getConfig(deviceAuthHeader(deviceSecret));
    const serialized = JSON.stringify(res.body.data.config);

    expect(serialized).not.toMatch(/contactPerson|contactNumber|address|email/i);
  });
});
