import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Location from '../../src/models/Location.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listTablets = (token, query = '') =>
  request(app)
    .get(`/api/v1/tablets${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getTablet = (token, id) =>
  request(app)
    .get(`/api/v1/tablets/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;
let registrarDept;
let libraryDept;
let registrarLoc1;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
  registrarLoc1 = await Location.findOne({ code: 'REG-LOC-01' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/tablets', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await listTablets();
    expect(res.status).toBe(401);
  });

  it('returns tablets across all departments for Super Admin', async () => {
    const res = await listTablets(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.length).toBe(4);
    expect(res.body.data.pagination.total).toBe(4);
  });

  it('restricts a Department Head to their own department tablets', async () => {
    const res = await listTablets(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(
      res.body.data.tablets.every((t) => t.departmentId === registrarDept._id.toString()),
    ).toBe(true);
    expect(res.body.data.tablets.length).toBe(2);
  });

  it('restricts a Personnel user to their own department tablets', async () => {
    const res = await listTablets(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(
      res.body.data.tablets.every((t) => t.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('a supplied departmentId query cannot bypass a non-admin department restriction', async () => {
    const res = await listTablets(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.tablets.every((t) => t.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('supports search across deviceName/deviceCode/serialNumber', async () => {
    const res = await listTablets(roles.superAdmin.token, '?search=REG-TAB-01');

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.length).toBe(1);
    expect(res.body.data.tablets[0].deviceCode).toBe('REG-TAB-01');
  });

  it('supports the departmentId filter for Super Admin', async () => {
    const res = await listTablets(
      roles.superAdmin.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.tablets.every((t) => t.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('supports the locationId filter', async () => {
    const res = await listTablets(
      roles.superAdmin.token,
      `?locationId=${registrarLoc1._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.length).toBe(1);
    expect(res.body.data.tablets[0].deviceCode).toBe('REG-TAB-01');
  });

  it('supports the isActive filter for Super Admin', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-02' });
    await Tablet.updateOne({ _id: target._id }, { $set: { isActive: false } });

    const res = await listTablets(roles.superAdmin.token, '?isActive=false');

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.every((t) => t.isActive === false)).toBe(true);
    expect(res.body.data.tablets.length).toBeGreaterThan(0);

    await Tablet.updateOne({ _id: target._id }, { $set: { isActive: true } });
  });

  it('returns correct pagination metadata', async () => {
    const res = await listTablets(roles.superAdmin.token, '?page=1&limit=3');

    expect(res.status).toBe(200);
    expect(res.body.data.tablets).toHaveLength(3);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 3, total: 4, pages: 2 });
  });

  it('handles invalid pagination values safely, falling back to defaults', async () => {
    const res = await listTablets(roles.superAdmin.token, '?page=-5&limit=notanumber');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(20);
  });

  it('rejects an invalid departmentId with 400', async () => {
    const res = await listTablets(roles.superAdmin.token, '?departmentId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid locationId with 400', async () => {
    const res = await listTablets(roles.superAdmin.token, '?locationId=not-a-valid-id');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/tablets/:id', () => {
  it('allows Super Admin to retrieve any tablet', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
    const res = await getTablet(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.tablet.deviceCode).toBe('LIB-TAB-01');
    expect(res.body.data.tablet.activationToken).toMatch(/^TAB-[A-Z0-9]{8}$/);
  });

  it('allows a Department Head to retrieve their own-department tablet', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getTablet(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('rejects a Department Head retrieving another department tablet with 403', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
    const res = await getTablet(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user retrieving another department tablet with 403', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getTablet(roles.libraryStaff.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await getTablet(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getTablet(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});
