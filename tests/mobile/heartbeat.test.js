import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const heartbeat = (headers, body) =>
  request(app).post('/api/v1/mobile/heartbeat').set(headers ?? {}).send(body ?? {});

let deviceSecret;
let tabletId;

beforeAll(async () => {
  await resetAndSeed();
  ({ deviceSecret, tabletId } = await activateTabletByDeviceCode('REG-TAB-01'));
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/mobile/heartbeat', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await heartbeat(undefined, {});
    expect(res.status).toBe(401);
  });

  it('updates lastSeen even with an empty body', async () => {
    const before = await Tablet.findById(tabletId);
    expect(before.lastSeen).toBeNull();

    const res = await heartbeat(deviceAuthHeader(deviceSecret), {});

    expect(res.status).toBe(200);
    expect(res.body.data.lastSeen).toBeTruthy();

    const after = await Tablet.findById(tabletId);
    expect(after.lastSeen).toBeInstanceOf(Date);
  });

  it('updates appVersion and androidVersion when provided', async () => {
    const res = await heartbeat(deviceAuthHeader(deviceSecret), {
      appVersion: '1.4.0',
      androidVersion: '13',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.appVersion).toBe('1.4.0');
    expect(res.body.data.androidVersion).toBe('13');

    const persisted = await Tablet.findById(tabletId);
    expect(persisted.appVersion).toBe('1.4.0');
    expect(persisted.androidVersion).toBe('13');
  });

  it('rejects an unknown field — no arbitrary tablet updates are allowed', async () => {
    const res = await heartbeat(deviceAuthHeader(deviceSecret), { deviceName: 'Hacked Kiosk' });

    expect(res.status).toBe(400);

    const persisted = await Tablet.findById(tabletId);
    expect(persisted.deviceName).not.toBe('Hacked Kiosk');
  });

  it('rejects a non-string appVersion with 400', async () => {
    const res = await heartbeat(deviceAuthHeader(deviceSecret), { appVersion: 123 });
    expect(res.status).toBe(400);
  });
});
