import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { activateTablet } from '../../src/services/mobileService.js';
import { disconnectTestDb } from '../utils/testDb.js';

const regenerateToken = (token, id) =>
  request(app)
    .post(`/api/v1/tablets/${id}/regenerate-token`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/tablets/:id/regenerate-token', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await regenerateToken(undefined, target._id.toString());
    expect(res.status).toBe(401);
  });

  it('rejects non-Super Admin roles with 403', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });

    const headRes = await regenerateToken(roles.registrarHead.token, target._id.toString());
    expect(headRes.status).toBe(403);

    const staffRes = await regenerateToken(roles.registrarStaff.token, target._id.toString());
    expect(staffRes.status).toBe(403);
  });

  it('allows Super Admin to regenerate the activation token, replacing the old value', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const originalToken = target.activationToken;

    const res = await regenerateToken(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.tablet.activationToken).toMatch(/^TAB-[A-Z0-9]{8}$/);
    expect(res.body.data.tablet.activationToken).not.toBe(originalToken);

    const persisted = await Tablet.findById(target._id);
    expect(persisted.activationToken).toBe(res.body.data.tablet.activationToken);
  });

  it('does not change any other tablet field', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
    const before = target.toObject();

    const res = await regenerateToken(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.tablet.deviceCode).toBe(before.deviceCode);
    expect(res.body.data.tablet.deviceName).toBe(before.deviceName);
    expect(res.body.data.tablet.locationId).toBe(before.locationId.toString());
    expect(res.body.data.tablet.departmentId).toBe(before.departmentId.toString());
    expect(res.body.data.tablet.isActive).toBe(before.isActive);
  });

  it('returns 404 for a nonexistent tablet id', async () => {
    const res = await regenerateToken(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await regenerateToken(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('never issues the same token twice across repeated regenerations', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-02' });
    const seenTokens = new Set([target.activationToken]);

    for (let i = 0; i < 3; i += 1) {
      const res = await regenerateToken(roles.superAdmin.token, target._id.toString());
      expect(seenTokens.has(res.body.data.tablet.activationToken)).toBe(false);
      seenTokens.add(res.body.data.tablet.activationToken);
    }
  });

  it('revokes an already-activated tablet\'s Device Secret and re-opens activation (P5.1)', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    await activateTablet(target.activationToken);

    const activated = await Tablet.findById(target._id).select('+deviceSecretHash');
    expect(activated.deviceSecretHash).toBeTruthy();
    expect(activated.activationConsumedAt).toBeInstanceOf(Date);

    await regenerateToken(roles.superAdmin.token, target._id.toString());

    const afterRegenerate = await Tablet.findById(target._id).select('+deviceSecretHash');
    expect(afterRegenerate.deviceSecretHash).toBeUndefined();
    expect(afterRegenerate.activationConsumedAt).toBeNull();
  });
});
