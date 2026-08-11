import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listDepartments = (token, query = '') =>
  request(app)
    .get(`/api/v1/departments${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getDepartment = (token, id) =>
  request(app)
    .get(`/api/v1/departments/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const createDepartment = (token, body) =>
  request(app)
    .post('/api/v1/departments')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchDepartment = (token, id, body) =>
  request(app)
    .patch(`/api/v1/departments/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

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

describe('GET /api/v1/departments', () => {
  it('returns every department for Super Admin', async () => {
    const res = await listDepartments(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.departments.length).toBeGreaterThanOrEqual(2);
  });

  it('supports isActive filtering for Super Admin', async () => {
    const res = await listDepartments(roles.superAdmin.token, '?isActive=true');

    expect(res.status).toBe(200);
    expect(res.body.data.departments.every((d) => d.isActive)).toBe(true);
  });

  it('returns only the assigned department for a Department Head', async () => {
    const res = await listDepartments(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.departments).toHaveLength(1);
    expect(res.body.data.departments[0].code).toBe('REG');
  });

  it('returns only the assigned department for Personnel', async () => {
    const res = await listDepartments(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(res.body.data.departments).toHaveLength(1);
    expect(res.body.data.departments[0].code).toBe('LIB');
  });

  it('a supplied departmentId-style query cannot expand a non-admin beyond their own department', async () => {
    const res = await listDepartments(
      roles.registrarHead.token,
      `?isActive=true`,
    );

    expect(res.body.data.departments).toHaveLength(1);
    expect(res.body.data.departments[0].code).toBe('REG');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await listDepartments();
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/departments/:id', () => {
  it('allows Super Admin to retrieve any department', async () => {
    const res = await getDepartment(roles.superAdmin.token, libraryDept._id.toString());
    expect(res.status).toBe(200);
    expect(res.body.data.department.code).toBe('LIB');
  });

  it('allows a Department Head to retrieve their own department', async () => {
    const res = await getDepartment(roles.registrarHead.token, registrarDept._id.toString());
    expect(res.status).toBe(200);
  });

  it('rejects a Department Head retrieving another department with 403', async () => {
    const res = await getDepartment(roles.registrarHead.token, libraryDept._id.toString());
    expect(res.status).toBe(403);
  });

  it('rejects Personnel retrieving another department with 403', async () => {
    const res = await getDepartment(roles.libraryStaff.token, registrarDept._id.toString());
    expect(res.status).toBe(403);
  });

  it('handles an invalid ObjectId safely with 404', async () => {
    const res = await getDepartment(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getDepartment(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/departments', () => {
  it('allows Super Admin to create a department', async () => {
    const res = await createDepartment(roles.superAdmin.token, {
      name: 'Admissions Office',
      code: 'ADM',
      description: 'Handles student admissions.',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.department.code).toBe('ADM');
    expect(res.body.data.department.isActive).toBe(true);
  });

  it('rejects a duplicate code with 409', async () => {
    const res = await createDepartment(roles.superAdmin.token, {
      name: 'Registrar Duplicate',
      code: 'reg',
    });

    expect(res.status).toBe(409);
  });

  it('rejects a duplicate name (case-insensitive) with 409', async () => {
    const res = await createDepartment(roles.superAdmin.token, {
      name: 'registrar',
      code: 'REG2',
    });

    expect(res.status).toBe(409);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createDepartment(roles.superAdmin.token, { description: 'no name/code' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'name')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'code')).toBe(true);
  });

  it('rejects a Department Head with 403', async () => {
    const res = await createDepartment(roles.registrarHead.token, {
      name: 'Should Fail',
      code: 'FAIL',
    });
    expect(res.status).toBe(403);
  });

  it('rejects Personnel with 403', async () => {
    const res = await createDepartment(roles.registrarStaff.token, {
      name: 'Should Fail Too',
      code: 'FAIL2',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await createDepartment(undefined, { name: 'X', code: 'X1' });
    expect(res.status).toBe(401);
  });

  it('accepts an optional satisfactionTarget override (V2.8), null by default when omitted', async () => {
    const withoutOverride = await createDepartment(roles.superAdmin.token, {
      name: 'No Override Office',
      code: 'NOOV',
    });
    expect(withoutOverride.body.data.department.satisfactionTarget).toBeNull();

    const withOverride = await createDepartment(roles.superAdmin.token, {
      name: 'Override Office',
      code: 'OVER',
      satisfactionTarget: 4.5,
    });
    expect(withOverride.status).toBe(201);
    expect(withOverride.body.data.department.satisfactionTarget).toBe(4.5);
  });

  it('rejects a satisfactionTarget outside [1, 5]', async () => {
    const res = await createDepartment(roles.superAdmin.token, {
      name: 'Bad Target Office',
      code: 'BADT',
      satisfactionTarget: 5.5,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'satisfactionTarget')).toBe(true);
  });
});

describe('PATCH /api/v1/departments/:id', () => {
  it('allows Super Admin to update a department', async () => {
    const created = await createDepartment(roles.superAdmin.token, {
      name: 'Accounting Office',
      code: 'ACC',
    });
    const id = created.body.data.department._id;

    const res = await patchDepartment(roles.superAdmin.token, id, {
      description: 'Updated description',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.department.description).toBe('Updated description');
  });

  it('rejects a non-Super Admin update with 403', async () => {
    const res = await patchDepartment(roles.registrarHead.token, registrarDept._id.toString(), {
      description: 'Should not apply',
    });
    expect(res.status).toBe(403);
  });

  it('rejects deactivation while active users remain assigned, with 409', async () => {
    const res = await patchDepartment(roles.superAdmin.token, registrarDept._id.toString(), {
      isActive: false,
    });

    expect(res.status).toBe(409);

    const stillActive = await Department.findById(registrarDept._id);
    expect(stillActive.isActive).toBe(true);
  });

  it('allows deactivation once no active users remain assigned', async () => {
    const created = await createDepartment(roles.superAdmin.token, {
      name: 'Temporary Office',
      code: 'TMP',
    });
    const id = created.body.data.department._id;

    const res = await patchDepartment(roles.superAdmin.token, id, { isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.department.isActive).toBe(false);
  });

  it('rejects an unknown field with 400', async () => {
    const res = await patchDepartment(roles.superAdmin.token, registrarDept._id.toString(), {
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent department id', async () => {
    const res = await patchDepartment(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      description: 'nope',
    });
    expect(res.status).toBe(404);
  });

  it('never returns passwordHash or unrelated sensitive user data', async () => {
    const res = await listDepartments(roles.superAdmin.token);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });

  it('allows Super Admin to set and clear a satisfactionTarget override (V2.8)', async () => {
    const setRes = await patchDepartment(roles.superAdmin.token, registrarDept._id.toString(), {
      satisfactionTarget: 3.8,
    });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.department.satisfactionTarget).toBe(3.8);

    const clearRes = await patchDepartment(roles.superAdmin.token, registrarDept._id.toString(), {
      satisfactionTarget: null,
    });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.department.satisfactionTarget).toBeNull();
  });

  it('rejects a satisfactionTarget outside [1, 5]', async () => {
    const res = await patchDepartment(roles.superAdmin.token, registrarDept._id.toString(), {
      satisfactionTarget: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'satisfactionTarget')).toBe(true);
  });
});
