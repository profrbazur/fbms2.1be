import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Personnel from '../../src/models/Personnel.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listPersonnel = (token, query = '') =>
  request(app)
    .get(`/api/v1/personnel${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getPersonnel = (token, id) =>
  request(app)
    .get(`/api/v1/personnel/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;
let registrarDept;
let libraryDept;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/personnel', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await listPersonnel();
    expect(res.status).toBe(401);
  });

  it('returns personnel across all departments for Super Admin', async () => {
    const res = await listPersonnel(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.length).toBe(8);
    expect(res.body.data.pagination.total).toBe(8);
  });

  it('restricts a Department Head to their own department personnel', async () => {
    const res = await listPersonnel(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(
      res.body.data.personnel.every((p) => p.departmentId === registrarDept._id.toString()),
    ).toBe(true);
    expect(res.body.data.personnel.length).toBe(4);
  });

  it('restricts a Personnel user to their own department personnel', async () => {
    const res = await listPersonnel(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(
      res.body.data.personnel.every((p) => p.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('a supplied departmentId query cannot bypass a non-admin department restriction', async () => {
    const res = await listPersonnel(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.personnel.every((p) => p.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('supports search across name/email/position/employeeNumber', async () => {
    const res = await listPersonnel(roles.superAdmin.token, '?search=Registrar Staff');

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.length).toBeGreaterThan(0);
    expect(res.body.data.personnel.every((p) => p.position.includes('Registrar Staff'))).toBe(
      true,
    );
  });

  it('supports the isActive filter for Super Admin', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0004' });
    await Personnel.updateOne({ _id: target._id }, { $set: { isActive: false } });

    const res = await listPersonnel(roles.superAdmin.token, '?isActive=false');

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.every((p) => p.isActive === false)).toBe(true);
    expect(res.body.data.personnel.length).toBeGreaterThan(0);

    await Personnel.updateOne({ _id: target._id }, { $set: { isActive: true } });
  });

  it('supports the departmentId filter for Super Admin', async () => {
    const res = await listPersonnel(
      roles.superAdmin.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.personnel.every((p) => p.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('returns correct pagination metadata', async () => {
    const res = await listPersonnel(roles.superAdmin.token, '?page=1&limit=3');

    expect(res.status).toBe(200);
    expect(res.body.data.personnel).toHaveLength(3);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 3, total: 8, pages: 3 });
  });

  it('handles invalid pagination values safely, falling back to defaults', async () => {
    const res = await listPersonnel(roles.superAdmin.token, '?page=-5&limit=notanumber');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(20);
  });

  it('never includes passwordHash or other sensitive authentication fields', async () => {
    const res = await listPersonnel(roles.superAdmin.token);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });
});

describe('GET /api/v1/personnel/:id', () => {
  it('allows Super Admin to retrieve any personnel record', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0002' });
    const res = await getPersonnel(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.employeeNumber).toBe('LIB-0002');
  });

  it('allows a Department Head to retrieve their own-department record', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0002' });
    const res = await getPersonnel(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('allows a Personnel user to retrieve their own-department record', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0002' });
    const res = await getPersonnel(roles.libraryStaff.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('rejects a Department Head retrieving another department record with 403', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0002' });
    const res = await getPersonnel(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user retrieving another department record with 403', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0002' });
    const res = await getPersonnel(roles.libraryStaff.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await getPersonnel(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getPersonnel(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});
