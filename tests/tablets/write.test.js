import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Location from '../../src/models/Location.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const createTablet = (token, body) =>
  request(app)
    .post('/api/v1/tablets')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchTablet = (token, id, body) =>
  request(app)
    .patch(`/api/v1/tablets/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

let roles;
let registrarLoc1;
let registrarLoc2;
let libraryLoc1;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarLoc1 = await Location.findOne({ code: 'REG-LOC-01' });
  registrarLoc2 = await Location.findOne({ code: 'REG-LOC-02' });
  libraryLoc1 = await Location.findOne({ code: 'LIB-LOC-01' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/tablets', () => {
  it('allows Super Admin to create a valid tablet, auto-generating a unique activation token and deriving departmentId from the location', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Test Registrar Kiosk',
      deviceCode: 'REG-TAB-99',
      locationId: registrarLoc1._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.tablet.deviceCode).toBe('REG-TAB-99');
    expect(res.body.data.tablet.departmentId).toBe(registrarLoc1.departmentId.toString());
    expect(res.body.data.tablet.activationToken).toMatch(/^TAB-[A-Z0-9]{8}$/);
    expect(res.body.data.tablet.isActive).toBe(true);
  });

  it('normalizes deviceCode to uppercase', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Lowercase Code Kiosk',
      deviceCode: 'reg-tab-98',
      locationId: registrarLoc2._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.tablet.deviceCode).toBe('REG-TAB-98');
  });

  it('rejects non-Super Admin creation with 403', async () => {
    const res = await createTablet(roles.registrarHead.token, {
      deviceName: 'Should Fail',
      deviceCode: 'REG-TAB-97',
      locationId: registrarLoc1._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await createTablet(undefined, {
      deviceName: 'Should Fail',
      deviceCode: 'REG-TAB-96',
      locationId: registrarLoc1._id.toString(),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a duplicate device code with 409', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Duplicate Code',
      deviceCode: 'reg-tab-01',
      locationId: registrarLoc1._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createTablet(roles.superAdmin.token, { serialNumber: 'incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'deviceName')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'deviceCode')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'locationId')).toBe(true);
  });

  it('rejects an invalid device code format with 400', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Bad Code',
      deviceCode: 'has a space',
      locationId: registrarLoc1._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent location with 400', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Bad Location',
      deviceCode: 'REG-TAB-95',
      locationId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an inactive location with 400', async () => {
    const inactiveLocation = await Location.create({
      name: 'Inactive For Tablet Test',
      code: 'INACT-LOC-01',
      departmentId: registrarLoc1.departmentId,
      buildingId: registrarLoc1.buildingId,
      isActive: false,
    });

    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Inactive Location Kiosk',
      deviceCode: 'REG-TAB-94',
      locationId: inactiveLocation._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an attempt to set departmentId directly with 400 (unknown field)', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Direct Department',
      deviceCode: 'REG-TAB-93',
      locationId: registrarLoc1._id.toString(),
      departmentId: registrarLoc1.departmentId.toString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'departmentId')).toBe(true);
  });

  it('rejects an attempt to set activationToken directly with 400 (unknown field)', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Direct Token',
      deviceCode: 'REG-TAB-92',
      locationId: registrarLoc1._id.toString(),
      activationToken: 'TAB-HACKED01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields with 400 and does not persist them', async () => {
    const res = await createTablet(roles.superAdmin.token, {
      deviceName: 'Unknown Field',
      deviceCode: 'REG-TAB-91',
      locationId: registrarLoc1._id.toString(),
      notARealField: 'hacker value',
    });

    expect(res.status).toBe(400);

    const persisted = await Tablet.findOne({ deviceCode: 'REG-TAB-91' });
    expect(persisted).toBeNull();
  });

  it('assigns a unique activation token to every created tablet', async () => {
    const first = await createTablet(roles.superAdmin.token, {
      deviceName: 'Token A',
      deviceCode: 'LIB-TAB-99',
      locationId: libraryLoc1._id.toString(),
    });
    const second = await createTablet(roles.superAdmin.token, {
      deviceName: 'Token B',
      deviceCode: 'LIB-TAB-98',
      locationId: libraryLoc1._id.toString(),
    });

    expect(first.body.data.tablet.activationToken).not.toBe(
      second.body.data.tablet.activationToken,
    );
  });
});

describe('PATCH /api/v1/tablets/:id', () => {
  it('allows Super Admin to update approved fields', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });

    const res = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      deviceName: 'Updated Kiosk Name',
      notes: 'Recently serviced.',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.tablet.deviceName).toBe('Updated Kiosk Name');
    expect(res.body.data.tablet.notes).toBe('Recently serviced.');
  });

  it('rejects a non-Super Admin update with 403', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });

    const res = await patchTablet(roles.registrarHead.token, target._id.toString(), {
      deviceName: 'Should Not Apply',
    });
    expect(res.status).toBe(403);
  });

  it('supports activation and deactivation', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-02' });

    const deactivateRes = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      isActive: false,
    });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.tablet.isActive).toBe(false);

    const activateRes = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      isActive: true,
    });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.tablet.isActive).toBe(true);
  });

  it('re-derives departmentId when locationId changes', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const libraryLocation = libraryLoc1;

    const res = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      locationId: libraryLocation._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.tablet.locationId).toBe(libraryLocation._id.toString());
    expect(res.body.data.tablet.departmentId).toBe(libraryLocation.departmentId.toString());
  });

  it('rejects reassigning to an inactive location with 400, leaving the record unchanged', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });
    const inactiveLocation = await Location.create({
      name: 'Inactive For Tablet Update Test',
      code: 'INACT-LOC-02',
      departmentId: registrarLoc2.departmentId,
      buildingId: registrarLoc2.buildingId,
      isActive: false,
    });

    const res = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      locationId: inactiveLocation._id.toString(),
    });
    expect(res.status).toBe(400);

    const unchanged = await Tablet.findById(target._id);
    expect(unchanged.locationId.toString()).toBe(registrarLoc2._id.toString());
  });

  it('rejects a duplicate device code on update with 409', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });
    const res = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      deviceCode: 'LIB-TAB-01',
    });
    expect(res.status).toBe(409);
  });

  it('rejects unknown fields with 400', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });
    const res = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('does not allow activationToken to be set via PATCH', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });
    const res = await patchTablet(roles.superAdmin.token, target._id.toString(), {
      activationToken: 'TAB-HACKED02',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent tablet id', async () => {
    const res = await patchTablet(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      deviceName: 'Nope',
    });
    expect(res.status).toBe(404);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await patchTablet(roles.superAdmin.token, 'not-a-valid-id', {
      deviceName: 'Nope',
    });
    expect(res.status).toBe(404);
  });
});
