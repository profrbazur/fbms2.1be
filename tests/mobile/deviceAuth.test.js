import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getConfig = (headers) => request(app).get('/api/v1/mobile/config').set(headers ?? {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('Device authentication (authenticateDevice middleware)', () => {
  it('rejects a request with no Authorization header at all', async () => {
    const res = await getConfig();
    expect(res.status).toBe(401);
  });

  it('rejects the staff JWT Bearer scheme — device endpoints do not accept it', async () => {
    const res = await getConfig({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed/unknown Device secret with 401', async () => {
    const res = await getConfig(deviceAuthHeader('not-a-real-secret'));
    expect(res.status).toBe(401);
  });

  it('accepts a valid Device secret issued by activation', async () => {
    const { deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01');
    const res = await getConfig(deviceAuthHeader(deviceSecret));
    expect(res.status).toBe(200);
  });

  it('rejects a Device secret belonging to a tablet that was since deactivated', async () => {
    const { deviceSecret, tabletId } = await activateTabletByDeviceCode('REG-TAB-02');

    await request(app)
      .patch(`/api/v1/tablets/${tabletId}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ isActive: false });

    const res = await getConfig(deviceAuthHeader(deviceSecret));
    expect(res.status).toBe(401);
  });

  it('rejects a Device secret that was revoked by regenerating the tablet\'s activation token', async () => {
    const { deviceSecret, tabletId } = await activateTabletByDeviceCode('LIB-TAB-01');

    const preCheck = await getConfig(deviceAuthHeader(deviceSecret));
    expect(preCheck.status).toBe(200);

    await request(app)
      .post(`/api/v1/tablets/${tabletId}/regenerate-token`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });

    const res = await getConfig(deviceAuthHeader(deviceSecret));
    expect(res.status).toBe(401);

    const persisted = await Tablet.findById(tabletId).select('+deviceSecretHash');
    expect(persisted.deviceSecretHash).toBeUndefined();
    expect(persisted.activationConsumedAt).toBeNull();
  });
});
