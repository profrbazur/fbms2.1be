import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import ServiceSession from '../../src/models/ServiceSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listServiceSessions = (token, query = '') =>
  request(app)
    .get(`/api/v1/service-sessions${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getServiceSession = (token, id) =>
  request(app)
    .get(`/api/v1/service-sessions/${id}`)
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

describe('GET /api/v1/service-sessions', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await listServiceSessions(undefined);
    expect(res.status).toBe(401);
  });

  it('Super Admin sees every seeded service session (6 total: 5 ended + 1 active)', async () => {
    const res = await listServiceSessions(roles.superAdmin.token, '?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(6);
  });

  it('Senior Leadership has global read access, same as Super Admin', async () => {
    const res = await listServiceSessions(roles.seniorLeadership.token, '?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(6);
  });

  it('Department Head is scoped to their own department only', async () => {
    const registrarRes = await listServiceSessions(roles.registrarHead.token, '?limit=100');
    expect(registrarRes.status).toBe(200);
    registrarRes.body.data.serviceSessions.forEach((session) => {
      expect(session.departmentId).toBe(registrarDept._id.toString());
    });
    expect(registrarRes.body.data.pagination.total).toBe(3); // seeded REG sessions

    const libraryRes = await listServiceSessions(roles.libraryHead.token, '?limit=100');
    expect(libraryRes.body.data.pagination.total).toBe(3); // seeded LIB sessions
  });

  it("Department Head's departmentId query param cannot widen visibility beyond their own department", async () => {
    const res = await listServiceSessions(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}&limit=100`,
    );
    expect(res.status).toBe(200);
    res.body.data.serviceSessions.forEach((session) => {
      expect(session.departmentId).toBe(registrarDept._id.toString());
    });
  });

  it('Personnel role is scoped to their own department only', async () => {
    const res = await listServiceSessions(roles.registrarStaff.token, '?limit=100');
    expect(res.status).toBe(200);
    res.body.data.serviceSessions.forEach((session) => {
      expect(session.departmentId).toBe(registrarDept._id.toString());
    });
  });

  it('filters by status', async () => {
    const res = await listServiceSessions(roles.superAdmin.token, '?status=active&limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.serviceSessions[0].status).toBe('active');
  });

  it('rejects an invalid status filter with 400', async () => {
    const res = await listServiceSessions(roles.superAdmin.token, '?status=bogus');
    expect(res.status).toBe(400);
  });

  it('populates a personnel display summary on each row', async () => {
    const res = await listServiceSessions(roles.superAdmin.token, '?limit=100');
    const withPersonnel = res.body.data.serviceSessions.find((s) => s.personnelId);
    expect(withPersonnel.personnelId.employeeNumber).toBeTruthy();
  });
});

describe('GET /api/v1/service-sessions/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const session = await ServiceSession.findOne({});
    const res = await getServiceSession(undefined, session._id.toString());
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent id', async () => {
    const res = await getServiceSession(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });

  it('Department Head cannot view a service session outside their own department', async () => {
    const libSession = await ServiceSession.findOne({ departmentId: libraryDept._id });
    const res = await getServiceSession(roles.registrarHead.token, libSession._id.toString());
    expect(res.status).toBe(403);
  });

  it('Department Head can view a service session within their own department', async () => {
    const regSession = await ServiceSession.findOne({ departmentId: registrarDept._id });
    const res = await getServiceSession(roles.registrarHead.token, regSession._id.toString());
    expect(res.status).toBe(200);
    expect(res.body.data.serviceSession._id).toBe(regSession._id.toString());
  });
});

describe('ServiceSession mutation is not reachable through the admin JWT API', () => {
  it('no POST/PATCH/DELETE route exists under /api/v1/service-sessions', async () => {
    const session = await ServiceSession.findOne({});

    const postRes = await request(app)
      .post('/api/v1/service-sessions')
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({});
    expect(postRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/api/v1/service-sessions/${session._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ status: 'ended' });
    expect(patchRes.status).toBe(404);
  });
});
