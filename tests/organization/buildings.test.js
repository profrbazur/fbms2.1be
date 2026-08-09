import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Building from '../../src/models/Building.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listBuildings = (token, query = '') =>
  request(app)
    .get(`/api/v1/buildings${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getBuilding = (token, id) =>
  request(app)
    .get(`/api/v1/buildings/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const createBuilding = (token, body) =>
  request(app)
    .post('/api/v1/buildings')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchBuilding = (token, id, body) =>
  request(app)
    .patch(`/api/v1/buildings/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

let roles;
let taftBuilding;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  taftBuilding = await Building.findOne({ code: 'TAFT' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/buildings', () => {
  it('returns every seeded building (5) for Super Admin', async () => {
    const res = await listBuildings(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.buildings).toHaveLength(5);
  });

  it('returns every building for Senior Leadership (global read)', async () => {
    const res = await listBuildings(roles.seniorLeadership.token);

    expect(res.status).toBe(200);
    expect(res.body.data.buildings).toHaveLength(5);
  });

  it('supports isActive filtering for Super Admin', async () => {
    const res = await listBuildings(roles.superAdmin.token, '?isActive=true');

    expect(res.status).toBe(200);
    expect(res.body.data.buildings.every((b) => b.isActive)).toBe(true);
  });

  it('supports search by name/code', async () => {
    const res = await listBuildings(roles.superAdmin.token, '?search=Taft');

    expect(res.status).toBe(200);
    expect(res.body.data.buildings.every((b) => b.name.includes('Taft'))).toBe(true);
  });

  it('returns only active buildings for a Department Head', async () => {
    const inactive = await Building.create({
      name: 'Inactive Building For Dept Head Test',
      code: 'INACTDH',
      isActive: false,
    });

    const res = await listBuildings(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.buildings.every((b) => b.isActive)).toBe(true);
    expect(res.body.data.buildings.some((b) => b._id === inactive._id.toString())).toBe(false);
  });

  it('returns only active buildings for Personnel', async () => {
    const res = await listBuildings(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(res.body.data.buildings.every((b) => b.isActive)).toBe(true);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await listBuildings();
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/buildings/:id', () => {
  it('allows Super Admin to retrieve any building', async () => {
    const res = await getBuilding(roles.superAdmin.token, taftBuilding._id.toString());
    expect(res.status).toBe(200);
    expect(res.body.data.building.code).toBe('TAFT');
  });

  it('allows Senior Leadership to retrieve any building', async () => {
    const res = await getBuilding(roles.seniorLeadership.token, taftBuilding._id.toString());
    expect(res.status).toBe(200);
  });

  it('allows a Department Head to retrieve an active building', async () => {
    const res = await getBuilding(roles.registrarHead.token, taftBuilding._id.toString());
    expect(res.status).toBe(200);
  });

  it('rejects a Department Head retrieving an inactive building with 403', async () => {
    const inactive = await Building.create({
      name: 'Inactive Building For Get Test',
      code: 'INACTGET',
      isActive: false,
    });

    const res = await getBuilding(roles.registrarHead.token, inactive._id.toString());
    expect(res.status).toBe(403);
  });

  it('handles an invalid ObjectId safely with 404', async () => {
    const res = await getBuilding(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getBuilding(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/buildings', () => {
  it('allows Super Admin to create a building', async () => {
    const res = await createBuilding(roles.superAdmin.token, {
      name: 'North Wing Annex',
      code: 'NWA',
      description: 'A newly constructed annex.',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.building.code).toBe('NWA');
    expect(res.body.data.building.isActive).toBe(true);
  });

  it('rejects a duplicate code with 409', async () => {
    const res = await createBuilding(roles.superAdmin.token, {
      name: 'Taft Duplicate',
      code: 'taft',
    });

    expect(res.status).toBe(409);
  });

  it('rejects a duplicate name (case-insensitive) with 409', async () => {
    const res = await createBuilding(roles.superAdmin.token, {
      name: 'taft campus',
      code: 'TAFT2',
    });

    expect(res.status).toBe(409);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createBuilding(roles.superAdmin.token, { description: 'no name/code' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'name')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'code')).toBe(true);
  });

  it('rejects an unknown field with 400', async () => {
    const res = await createBuilding(roles.superAdmin.token, {
      name: 'Bad Field Building',
      code: 'BADFLD',
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a Department Head with 403 (mutation denied)', async () => {
    const res = await createBuilding(roles.registrarHead.token, {
      name: 'Should Fail',
      code: 'FAILDH',
    });
    expect(res.status).toBe(403);
  });

  it('rejects Personnel with 403', async () => {
    const res = await createBuilding(roles.registrarStaff.token, {
      name: 'Should Fail Too',
      code: 'FAILP',
    });
    expect(res.status).toBe(403);
  });

  it('rejects Senior Leadership with 403 (read-only — mutation denied)', async () => {
    const res = await createBuilding(roles.seniorLeadership.token, {
      name: 'Should Fail Senior Leadership',
      code: 'FAILSL',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await createBuilding(undefined, { name: 'X', code: 'X1' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/buildings/:id', () => {
  it('allows Super Admin to update a building', async () => {
    const created = await createBuilding(roles.superAdmin.token, {
      name: 'Patchable Building',
      code: 'PATCHB1',
    });
    const id = created.body.data.building._id;

    const res = await patchBuilding(roles.superAdmin.token, id, {
      description: 'Updated description',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.building.description).toBe('Updated description');
  });

  it('allows Super Admin to deactivate and reactivate a building', async () => {
    const created = await createBuilding(roles.superAdmin.token, {
      name: 'Togglable Building',
      code: 'TOGGLEB1',
    });
    const id = created.body.data.building._id;

    const deactivateRes = await patchBuilding(roles.superAdmin.token, id, { isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.building.isActive).toBe(false);

    const reactivateRes = await patchBuilding(roles.superAdmin.token, id, { isActive: true });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.building.isActive).toBe(true);
  });

  it('rejects a Department Head update with 403', async () => {
    const res = await patchBuilding(roles.registrarHead.token, taftBuilding._id.toString(), {
      description: 'Should not apply',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a Senior Leadership update with 403 (read-only — mutation denied)', async () => {
    const res = await patchBuilding(roles.seniorLeadership.token, taftBuilding._id.toString(), {
      description: 'Should not apply either',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown field with 400', async () => {
    const res = await patchBuilding(roles.superAdmin.token, taftBuilding._id.toString(), {
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent building id', async () => {
    const res = await patchBuilding(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      description: 'nope',
    });
    expect(res.status).toBe(404);
  });

  it('never returns passwordHash or unrelated sensitive user data', async () => {
    const res = await listBuildings(roles.superAdmin.token);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });
});
