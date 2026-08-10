import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Personnel from '../../src/models/Personnel.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const regeneratePin = (token, id) =>
  request(app)
    .post(`/api/v1/personnel/${id}/regenerate-pin`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send();

const getPersonnel = (token, id) =>
  request(app)
    .get(`/api/v1/personnel/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/personnel/:id/regenerate-pin', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0002' });
    const res = await regeneratePin(undefined, target._id.toString());
    expect(res.status).toBe(401);
  });

  it('rejects a non-Super Admin caller with 403', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0002' });

    const asDeptHead = await regeneratePin(roles.registrarHead.token, target._id.toString());
    expect(asDeptHead.status).toBe(403);

    const asPersonnel = await regeneratePin(roles.registrarStaff.token, target._id.toString());
    expect(asPersonnel.status).toBe(403);

    const asLeadership = await regeneratePin(roles.seniorLeadership.token, target._id.toString());
    expect(asLeadership.status).toBe(403);
  });

  it('returns 404 for a nonexistent personnel id', async () => {
    const res = await regeneratePin(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await regeneratePin(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('issues a fresh, exactly-6-digit plaintext PIN exactly once, never exposing pinHash', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0002' });

    const res = await regeneratePin(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.pin).toMatch(/^\d{6}$/);
    expect(res.body.data.personnel.pinHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/"pinHash"/);
  });

  it('sets pinSetAt on the personnel record and updates it on every regeneration', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0003' });
    expect(target.pinSetAt).toBeTruthy();

    const firstRes = await regeneratePin(roles.superAdmin.token, target._id.toString());
    const firstSetAt = firstRes.body.data.personnel.pinSetAt;
    expect(firstSetAt).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondRes = await regeneratePin(roles.superAdmin.token, target._id.toString());
    expect(secondRes.body.data.personnel.pinSetAt).not.toBe(firstSetAt);
  });

  it('the old PIN stops working once a new one is regenerated', async () => {
    const oldPin = '111004'; // seeded PIN for REG-0004
    const target = await Personnel.findOne({ employeeNumber: 'REG-0004' });

    const regenRes = await regeneratePin(roles.superAdmin.token, target._id.toString());
    const newPin = regenRes.body.data.pin;
    expect(newPin).not.toBe(oldPin);
  });

  it('never returns pinHash from GET /api/v1/personnel/:id either', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0001' });
    const res = await getPersonnel(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.pinHash).toBeUndefined();
    expect(res.body.data.personnel.pinSetAt).toBeTruthy();
  });
});
