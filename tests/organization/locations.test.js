import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Location from '../../src/models/Location.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listLocations = (token, query = '') =>
  request(app)
    .get(`/api/v1/locations${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getLocation = (token, id) =>
  request(app)
    .get(`/api/v1/locations/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const createLocation = (token, body) =>
  request(app)
    .post('/api/v1/locations')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchLocation = (token, id, body) =>
  request(app)
    .patch(`/api/v1/locations/${id}`)
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

describe('GET /api/v1/locations', () => {
  it('returns locations across all departments for Super Admin', async () => {
    const res = await listLocations(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.locations.length).toBeGreaterThan(0);
    expect(res.body.data.pagination).toMatchObject({ page: 1 });
  });

  it('restricts a Department Head to their own department locations', async () => {
    const res = await listLocations(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.locations.length).toBeGreaterThan(0);
    expect(
      res.body.data.locations.every((l) => l.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('restricts Personnel to their own department locations', async () => {
    const res = await listLocations(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(
      res.body.data.locations.every((l) => l.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('a supplied departmentId query cannot bypass a non-admin department restriction', async () => {
    const res = await listLocations(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.locations.every((l) => l.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('supports pagination', async () => {
    const res = await listLocations(roles.superAdmin.token, '?page=1&limit=1');

    expect(res.status).toBe(200);
    expect(res.body.data.locations).toHaveLength(1);
    expect(res.body.data.pagination.limit).toBe(1);
  });

  it('supports search by name/code', async () => {
    const res = await listLocations(roles.superAdmin.token, '?search=Circulation');

    expect(res.status).toBe(200);
    expect(res.body.data.locations.every((l) => l.name.includes('Circulation'))).toBe(true);
  });

  it('supports departmentId filtering for Super Admin', async () => {
    const res = await listLocations(
      roles.superAdmin.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.locations.every((l) => l.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('returns an empty result set safely', async () => {
    const res = await listLocations(roles.superAdmin.token, '?search=NoSuchLocationXYZ');

    expect(res.status).toBe(200);
    expect(res.body.data.locations).toHaveLength(0);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await listLocations();
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/locations/:id', () => {
  it('handles an invalid id safely with 404', async () => {
    const res = await getLocation(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/locations', () => {
  it('allows Super Admin to create a location', async () => {
    const res = await createLocation(roles.superAdmin.token, {
      name: 'Registrar Annex Counter',
      code: 'REG-LOC-99',
      departmentId: registrarDept._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.location.code).toBe('REG-LOC-99');
  });

  it('rejects non-Super Admin creation with 403', async () => {
    const res = await createLocation(roles.registrarHead.token, {
      name: 'Should Fail',
      code: 'FAIL-LOC-01',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid department id with 400', async () => {
    const res = await createLocation(roles.superAdmin.token, {
      name: 'Invalid Dept Location',
      code: 'BAD-LOC-01',
      departmentId: 'not-a-valid-id',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent department id with 400', async () => {
    const res = await createLocation(roles.superAdmin.token, {
      name: 'Missing Dept Location',
      code: 'BAD-LOC-02',
      departmentId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
  });

  it('rejects assignment to an inactive department with 400', async () => {
    const inactiveDept = await Department.create({
      name: 'Inactive For Location Test',
      code: 'INACT1',
      isActive: false,
    });

    const res = await createLocation(roles.superAdmin.token, {
      name: 'Should Fail Inactive',
      code: 'BAD-LOC-03',
      departmentId: inactiveDept._id.toString(),
    });

    expect(res.status).toBe(400);
  });

  it('rejects a duplicate location code with 409', async () => {
    const res = await createLocation(roles.superAdmin.token, {
      name: 'Duplicate Code Attempt',
      code: 'reg-loc-01',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createLocation(roles.superAdmin.token, { description: 'incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'name')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'code')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'departmentId')).toBe(true);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await createLocation(undefined, {
      name: 'X',
      code: 'X-LOC-1',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/locations/:id', () => {
  it('allows Super Admin to update a location', async () => {
    const created = await createLocation(roles.superAdmin.token, {
      name: 'Patchable Location',
      code: 'PATCH-LOC-01',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.location._id;

    const res = await patchLocation(roles.superAdmin.token, id, {
      description: 'Updated description',
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.location.description).toBe('Updated description');
    expect(res.body.data.location.isActive).toBe(false);
  });

  it('rejects an unauthorized update with 403', async () => {
    const target = await Location.findOne({ code: 'REG-LOC-01' });

    const res = await patchLocation(roles.registrarHead.token, target._id.toString(), {
      description: 'Should not apply',
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent location id', async () => {
    const res = await patchLocation(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      description: 'nope',
    });
    expect(res.status).toBe(404);
  });

  it('allows reassigning a location to a different active department', async () => {
    const created = await createLocation(roles.superAdmin.token, {
      name: 'Reassignable Location',
      code: 'REASSIGN-LOC-01',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.location._id;

    const res = await patchLocation(roles.superAdmin.token, id, {
      departmentId: libraryDept._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.location.departmentId).toBe(libraryDept._id.toString());
  });

  it('allows changing a location code to a new, unused value', async () => {
    const created = await createLocation(roles.superAdmin.token, {
      name: 'Renamable Code Location',
      code: 'RENAME-LOC-OLD',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.location._id;

    const res = await patchLocation(roles.superAdmin.token, id, {
      code: 'rename-loc-new',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.location.code).toBe('RENAME-LOC-NEW');
  });
});
