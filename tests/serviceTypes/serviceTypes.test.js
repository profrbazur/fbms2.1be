import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import ServiceType from '../../src/models/ServiceType.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listServiceTypes = (token, query = '') =>
  request(app)
    .get(`/api/v1/service-types${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getServiceType = (token, id) =>
  request(app)
    .get(`/api/v1/service-types/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const createServiceType = (token, body) =>
  request(app)
    .post('/api/v1/service-types')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchServiceType = (token, id, body) =>
  request(app)
    .patch(`/api/v1/service-types/${id}`)
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

describe('GET /api/v1/service-types', () => {
  it('returns service types across all departments for Super Admin', async () => {
    const res = await listServiceTypes(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.serviceTypes.length).toBe(12);
  });

  it('restricts a Department Head to their own department, active-only', async () => {
    const res = await listServiceTypes(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.serviceTypes.length).toBeGreaterThan(0);
    expect(
      res.body.data.serviceTypes.every((s) => s.departmentId === registrarDept._id.toString()),
    ).toBe(true);
    expect(res.body.data.serviceTypes.every((s) => s.isActive)).toBe(true);
  });

  it('restricts Personnel to their own department', async () => {
    const res = await listServiceTypes(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(
      res.body.data.serviceTypes.every((s) => s.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('a supplied departmentId query cannot bypass a non-admin department restriction', async () => {
    const res = await listServiceTypes(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.serviceTypes.every((s) => s.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('Senior Leadership sees institution-wide service types (global read)', async () => {
    const res = await listServiceTypes(roles.seniorLeadership.token);

    expect(res.status).toBe(200);
    expect(res.body.data.serviceTypes.length).toBe(12);
  });

  it('supports departmentId filtering for Super Admin', async () => {
    const res = await listServiceTypes(
      roles.superAdmin.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.serviceTypes.every((s) => s.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('Super Admin can see the inactive service type with isActive=false filter', async () => {
    const res = await listServiceTypes(roles.superAdmin.token, '?isActive=false');

    expect(res.status).toBe(200);
    expect(res.body.data.serviceTypes.length).toBe(1);
    expect(res.body.data.serviceTypes[0].code).toBe('LIB-SVC-04');
  });

  it('supports search by name/code', async () => {
    const res = await listServiceTypes(roles.superAdmin.token, '?search=Clearance');

    expect(res.status).toBe(200);
    // "Clearance" exists in both departments — proves department-scoped
    // uniqueness didn't accidentally collapse them into one record.
    expect(res.body.data.serviceTypes.length).toBe(2);
    expect(res.body.data.serviceTypes.every((s) => s.name === 'Clearance')).toBe(true);
    expect(new Set(res.body.data.serviceTypes.map((s) => s.departmentId)).size).toBe(2);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await listServiceTypes();
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/service-types/:id', () => {
  it('handles an invalid id safely with 404', async () => {
    const res = await getServiceType(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('rejects a Department Head reading another department\'s service type with 403', async () => {
    const libraryServiceType = await ServiceType.findOne({ departmentId: libraryDept._id, code: 'LIB-SVC-01' });

    const res = await getServiceType(roles.registrarHead.token, libraryServiceType._id.toString());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/service-types', () => {
  it('allows Super Admin to create a service type', async () => {
    const res = await createServiceType(roles.superAdmin.token, {
      name: 'New Service Type',
      code: 'REG-SVC-99',
      departmentId: registrarDept._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.serviceType.code).toBe('REG-SVC-99');
    expect(res.body.data.serviceType.isActive).toBe(true);
  });

  it('rejects non-Super Admin creation with 403 (Department Head has no management rights)', async () => {
    const res = await createServiceType(roles.registrarHead.token, {
      name: 'Should Fail',
      code: 'FAIL-SVC-01',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects Senior Leadership creation with 403 (read-only)', async () => {
    const res = await createServiceType(roles.seniorLeadership.token, {
      name: 'Should Fail',
      code: 'FAIL-SVC-02',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid department id with 400', async () => {
    const res = await createServiceType(roles.superAdmin.token, {
      name: 'Invalid Dept',
      code: 'BAD-SVC-01',
      departmentId: 'not-a-valid-id',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent department id with 400', async () => {
    const res = await createServiceType(roles.superAdmin.token, {
      name: 'Missing Dept',
      code: 'BAD-SVC-02',
      departmentId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
  });

  it('rejects assignment to an inactive department with 400', async () => {
    const inactiveDept = await Department.create({
      name: 'Inactive For Service Type Test',
      code: 'INACT2',
      isActive: false,
    });

    const res = await createServiceType(roles.superAdmin.token, {
      name: 'Should Fail Inactive',
      code: 'BAD-SVC-03',
      departmentId: inactiveDept._id.toString(),
    });

    expect(res.status).toBe(400);
  });

  it('rejects a duplicate code within the same department with 409', async () => {
    const res = await createServiceType(roles.superAdmin.token, {
      name: 'Duplicate Code Attempt',
      code: 'reg-svc-01',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('allows the same code/name in a DIFFERENT department (department-scoped uniqueness, not global)', async () => {
    // REG-SVC-01 already exists for Registrar; the same literal code is
    // free to use in Library, since ServiceType uniqueness is scoped to
    // { departmentId, code }, not global (see this file's own "Clearance"
    // search test, and serviceTypeSeeder.js/ServiceType.js's own comments).
    const res = await createServiceType(roles.superAdmin.token, {
      name: 'Same Code Different Department',
      code: 'REG-SVC-01',
      departmentId: libraryDept._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.serviceType.code).toBe('REG-SVC-01');
    expect(res.body.data.serviceType.departmentId).toBe(libraryDept._id.toString());
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createServiceType(roles.superAdmin.token, { description: 'incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'name')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'code')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'departmentId')).toBe(true);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await createServiceType(undefined, {
      name: 'X',
      code: 'X-SVC-1',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/service-types/:id', () => {
  it('allows Super Admin to update a service type', async () => {
    const created = await createServiceType(roles.superAdmin.token, {
      name: 'Patchable Service Type',
      code: 'PATCH-SVC-01',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.serviceType._id;

    const res = await patchServiceType(roles.superAdmin.token, id, {
      description: 'Updated description',
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.serviceType.description).toBe('Updated description');
    expect(res.body.data.serviceType.isActive).toBe(false);
  });

  it('rejects an unauthorized update with 403', async () => {
    const target = await ServiceType.findOne({ code: 'REG-SVC-01', departmentId: registrarDept._id });

    const res = await patchServiceType(roles.registrarHead.token, target._id.toString(), {
      description: 'Should not apply',
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent service type id', async () => {
    const res = await patchServiceType(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      description: 'nope',
    });
    expect(res.status).toBe(404);
  });

  it('rejects changing departmentId (immutable after creation)', async () => {
    const created = await createServiceType(roles.superAdmin.token, {
      name: 'Immutable Department Test',
      code: 'IMMUTABLE-SVC-01',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.serviceType._id;

    const res = await patchServiceType(roles.superAdmin.token, id, {
      departmentId: libraryDept._id.toString(),
    });

    // Rejected at the validator layer as an unknown field for PATCH (not
    // in UPDATE_ALLOWED_FIELDS) — see validateServiceType.js.
    expect(res.status).toBe(400);

    const unchanged = await ServiceType.findById(id);
    expect(unchanged.departmentId.toString()).toBe(registrarDept._id.toString());
  });

  it('allows changing a service type code to a new, unused-within-department value', async () => {
    const created = await createServiceType(roles.superAdmin.token, {
      name: 'Renamable Code Service Type',
      code: 'RENAME-SVC-OLD',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.serviceType._id;

    const res = await patchServiceType(roles.superAdmin.token, id, {
      code: 'rename-svc-new',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.serviceType.code).toBe('RENAME-SVC-NEW');
  });

  it('rejects a duplicate code within the same department on update with 409', async () => {
    const created = await createServiceType(roles.superAdmin.token, {
      name: 'Will Collide',
      code: 'COLLIDE-SVC-01',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.serviceType._id;

    const res = await patchServiceType(roles.superAdmin.token, id, {
      code: 'REG-SVC-02',
    });

    expect(res.status).toBe(409);
  });
});
