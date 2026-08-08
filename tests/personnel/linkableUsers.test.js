import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getLinkableUsers = (token) =>
  request(app)
    .get('/api/v1/personnel/linkable-users')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/personnel/linkable-users', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getLinkableUsers();
    expect(res.status).toBe(401);
  });

  it('rejects a Department Head with 403', async () => {
    const res = await getLinkableUsers(roles.registrarHead.token);
    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user with 403', async () => {
    const res = await getLinkableUsers(roles.registrarStaff.token);
    expect(res.status).toBe(403);
  });

  it('allows Super Admin to retrieve all 9 users with minimal safe fields', async () => {
    const res = await getLinkableUsers(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(9);

    const sample = res.body.data.users[0];
    expect(Object.keys(sample).sort()).toEqual(
      ['departmentId', 'displayName', 'email', 'id', 'isActive', 'isLinked', 'role'].sort(),
    );
  });

  it('excludes passwordHash and other authentication secrets', async () => {
    const res = await getLinkableUsers(roles.superAdmin.token);
    const body = JSON.stringify(res.body);

    expect(body).not.toMatch(/passwordHash/i);
    expect(body).not.toMatch(/authProvider/i);
    expect(body).not.toMatch(/googleSubjectId/i);
  });

  it('accurately reports linked status per user', async () => {
    const res = await getLinkableUsers(roles.superAdmin.token);
    const users = res.body.data.users;

    const registrarHead = users.find((u) => u.email === 'registrar.head@fbms.test');
    const superAdmin = users.find((u) => u.email === 'superadmin@fbms.test');

    expect(registrarHead.isLinked).toBe(true);
    expect(superAdmin.isLinked).toBe(false);
  });

  it('accurately reports department information per user', async () => {
    const res = await getLinkableUsers(roles.superAdmin.token);
    const users = res.body.data.users;

    const registrarStaff = users.find((u) => u.email === 'registrar.staff1@fbms.test');
    const superAdmin = users.find((u) => u.email === 'superadmin@fbms.test');

    expect(registrarStaff.departmentId).toBeTruthy();
    expect(superAdmin.departmentId).toBeNull();
  });
});
