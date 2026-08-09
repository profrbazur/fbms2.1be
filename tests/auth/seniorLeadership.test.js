import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const authed = (token) => ({ Authorization: `Bearer ${token}` });
const FAKE_ID = '000000000000000000000000';

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

describe('senior_leadership — authentication and role recognition', () => {
  it('logs in successfully with the seeded credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'leadership1@fbms.test', password: 'Passw0rd!123' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('senior_leadership');
    expect(res.body.data.user.departmentId).toBeNull();
  });

  it('GET /auth/me reports the senior_leadership role', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('senior_leadership');
  });
});

describe('senior_leadership — global read access (matches Super Admin scope, not Department Head scope)', () => {
  it('Dashboard summary is institution-wide, identical in shape to Super Admin', async () => {
    const [slRes, adminRes] = await Promise.all([
      request(app).get('/api/v1/dashboard/summary').set(authed(roles.seniorLeadership.token)),
      request(app).get('/api/v1/dashboard/summary').set(authed(roles.superAdmin.token)),
    ]);

    expect(slRes.status).toBe(200);
    expect(slRes.body.data.cards.departmentsCount).toBe(2);
    expect(slRes.body.data.cards.totalFeedback).toBe(adminRes.body.data.cards.totalFeedback);
    expect(slRes.body.data.charts.feedbackByDepartment).toHaveLength(2);
  });

  it('Reports feedback-summary is readable and institution-wide', async () => {
    const res = await request(app)
      .get('/api/v1/reports/feedback-summary')
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
  });

  it('Feedback list returns sessions across every department, not pinned to one', async () => {
    const res = await request(app).get('/api/v1/feedback').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(10);
    const departmentIds = new Set(res.body.data.feedbackSessions.map((s) => s.departmentId));
    expect(departmentIds.size).toBe(2);
  });

  it('Live Monitoring summary is institution-wide', async () => {
    const res = await request(app)
      .get('/api/v1/live-monitoring/summary')
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.summary.departmentsCount).toBe(2);
  });

  it('Organization settings (University Profile) are readable', async () => {
    const res = await request(app).get('/api/v1/organization').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
  });

  it('Departments list returns both departments (global, not own-department only)', async () => {
    const res = await request(app).get('/api/v1/departments').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.departments).toHaveLength(2);
  });

  it('Locations list returns locations across both departments', async () => {
    const res = await request(app).get('/api/v1/locations?limit=100').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(4);
  });

  it('Personnel list returns personnel across both departments', async () => {
    const res = await request(app).get('/api/v1/personnel?limit=100').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(8);
  });

  it('Tablets list returns tablets across both departments', async () => {
    const res = await request(app).get('/api/v1/tablets?limit=100').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(4);
  });

  it('Surveys list returns every survey, including another department\'s unpublished draft', async () => {
    const res = await request(app).get('/api/v1/surveys?limit=100').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(3);
    const draft = res.body.data.surveys.find((s) => s.title === 'Library Services Feedback');
    expect(draft).toBeTruthy();
    expect(draft.isPublished).toBe(false);
  });

  it('a single Department/Location/Personnel/Tablet record from either department is individually readable', async () => {
    const [deptRes, libDeptRes] = await Promise.all([
      request(app).get(`/api/v1/departments/${registrarDept._id}`).set(authed(roles.seniorLeadership.token)),
      request(app).get(`/api/v1/departments/${libraryDept._id}`).set(authed(roles.seniorLeadership.token)),
    ]);

    expect(deptRes.status).toBe(200);
    expect(libDeptRes.status).toBe(200);
  });
});

// FBMS V2.2 Final QA Correction: Senior Leadership is a global read-only
// role, so it must get the same read-only department-narrowing filter
// Super Admin already has on Reports/Feedback/Live Monitoring — verified
// directly at the API level here (the frontend-only smoke-test coverage
// alone would not prove the backend actually honors the parameter).
describe('senior_leadership — department-filtered reads (Reports/Feedback/Live Monitoring)', () => {
  it('Reports feedback-summary: no departmentId param returns institution-wide totals', async () => {
    const res = await request(app)
      .get('/api/v1/reports/feedback-summary')
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.filters.departmentId).toBeNull();
    expect(res.body.data.summary.totalFeedback).toBe(10);
  });

  it('Reports feedback-summary: departmentId param narrows to that department only', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/feedback-summary?departmentId=${registrarDept._id.toString()}`)
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.filters.departmentId).toBe(registrarDept._id.toString());
    expect(res.body.data.summary.totalFeedback).toBe(8);
  });

  it('Feedback list: no departmentId param returns sessions across every department', async () => {
    const res = await request(app).get('/api/v1/feedback').set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(10);
  });

  it('Feedback list: departmentId param narrows to that department only', async () => {
    const res = await request(app)
      .get(`/api/v1/feedback?departmentId=${libraryDept._id.toString()}`)
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.feedbackSessions.every((s) => s.departmentId === libraryDept._id.toString())).toBe(true);
  });

  it('Live Monitoring tablets: no departmentId param returns tablets across every department', async () => {
    const res = await request(app)
      .get('/api/v1/live-monitoring/tablets?limit=100')
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(4);
  });

  it('Live Monitoring tablets: departmentId param narrows to that department only', async () => {
    const res = await request(app)
      .get(`/api/v1/live-monitoring/tablets?departmentId=${registrarDept._id.toString()}&limit=100`)
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.tablets.every((t) => t.departmentId === registrarDept._id.toString())).toBe(true);
  });

  it('an invalid departmentId is rejected with 400, not silently ignored', async () => {
    const res = await request(app)
      .get('/api/v1/reports/feedback-summary?departmentId=not-a-valid-id')
      .set(authed(roles.seniorLeadership.token));

    expect(res.status).toBe(400);
  });
});

describe('security regression — filter parameters cannot be used to escape department isolation', () => {
  it('Department Head: a departmentId query param on Reports cannot widen visibility beyond their own department', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/feedback-summary?departmentId=${libraryDept._id.toString()}`)
      .set(authed(roles.registrarHead.token));

    expect(res.status).toBe(200);
    expect(res.body.data.filters.departmentId).toBe(registrarDept._id.toString());
  });

  it('Department Head: a departmentId query param on Feedback cannot widen visibility beyond their own department', async () => {
    const res = await request(app)
      .get(`/api/v1/feedback?departmentId=${libraryDept._id.toString()}`)
      .set(authed(roles.registrarHead.token));

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSessions.every((s) => s.departmentId === registrarDept._id.toString())).toBe(true);
  });

  it('Department Head: a departmentId query param on Live Monitoring tablets cannot widen visibility beyond their own department', async () => {
    const res = await request(app)
      .get(`/api/v1/live-monitoring/tablets?departmentId=${libraryDept._id.toString()}&limit=100`)
      .set(authed(roles.registrarHead.token));

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.every((t) => t.departmentId === registrarDept._id.toString())).toBe(true);
  });

  it('Personnel: a departmentId query param on Feedback cannot widen visibility beyond their own department', async () => {
    const res = await request(app)
      .get(`/api/v1/feedback?departmentId=${registrarDept._id.toString()}`)
      .set(authed(roles.libraryStaff.token));

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSessions.every((s) => s.departmentId === libraryDept._id.toString())).toBe(true);
  });

  it('senior_leadership filtered reads never expose write access alongside them', async () => {
    const res = await request(app)
      .post(`/api/v1/departments`)
      .set(authed(roles.seniorLeadership.token))
      .send({ name: 'Should Not Exist', code: 'SNE2' });

    expect(res.status).toBe(403);
  });
});

describe('senior_leadership — forbidden reads (no accidental Super Admin privilege)', () => {
  it('cannot read System Settings', async () => {
    const res = await request(app).get('/api/v1/settings').set(authed(roles.seniorLeadership.token));
    expect(res.status).toBe(403);
  });

  it('cannot read Audit Logs', async () => {
    const res = await request(app).get('/api/v1/audit-logs').set(authed(roles.seniorLeadership.token));
    expect(res.status).toBe(403);
  });

  it('cannot read the linkable-users admin utility', async () => {
    const res = await request(app)
      .get('/api/v1/personnel/linkable-users')
      .set(authed(roles.seniorLeadership.token));
    expect(res.status).toBe(403);
  });
});

describe('senior_leadership — forbidden writes across every mutation endpoint', () => {
  const writeAttempts = [
    ['POST', '/api/v1/departments', { name: 'Should Not Exist', code: 'SNE' }],
    ['PATCH', `/api/v1/departments/${FAKE_ID}`, { isActive: false }],
    ['POST', '/api/v1/locations', { name: 'x', code: 'x', departmentId: FAKE_ID }],
    ['PATCH', `/api/v1/locations/${FAKE_ID}`, { isActive: false }],
    ['PATCH', '/api/v1/organization', { defaultTrendWindowDays: 30 }],
    ['POST', '/api/v1/personnel', { employeeNumber: 'X', firstName: 'X', lastName: 'X', email: 'x@x.com', position: 'X', departmentId: FAKE_ID }],
    ['PATCH', `/api/v1/personnel/${FAKE_ID}`, { isActive: false }],
    ['POST', '/api/v1/tablets', { deviceName: 'x', deviceCode: 'x', locationId: FAKE_ID }],
    ['PATCH', `/api/v1/tablets/${FAKE_ID}`, { isActive: false }],
    ['POST', `/api/v1/tablets/${FAKE_ID}/regenerate-token`, {}],
    ['POST', '/api/v1/surveys', { title: 'x' }],
    ['PATCH', `/api/v1/surveys/${FAKE_ID}`, { title: 'x' }],
    ['POST', `/api/v1/surveys/${FAKE_ID}/publish`, {}],
    ['POST', `/api/v1/surveys/${FAKE_ID}/unpublish`, {}],
    ['POST', `/api/v1/surveys/${FAKE_ID}/archive`, {}],
    ['POST', `/api/v1/surveys/${FAKE_ID}/questions`, { questionText: 'x', questionType: 'short_text' }],
    ['PATCH', `/api/v1/questions/${FAKE_ID}`, { questionText: 'x' }],
    ['PATCH', '/api/v1/settings', { defaultTrendWindowDays: 30 }],
    ['POST', '/api/v1/settings/logo', {}],
    ['POST', '/api/v1/developer-portal/reload-canonical-dataset', {}],
  ];

  it.each(writeAttempts)('%s %s is rejected with 403', async (method, path, body) => {
    const agent = request(app);
    const res = await agent[method.toLowerCase()](path)
      .set(authed(roles.seniorLeadership.token))
      .send(body);

    expect(res.status).toBe(403);
  });
});

describe('regression — existing roles are unaffected by the senior_leadership role', () => {
  it('Super Admin retains full read and write access', async () => {
    const readRes = await request(app).get('/api/v1/departments').set(authed(roles.superAdmin.token));
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.departments).toHaveLength(2);

    const auditRes = await request(app).get('/api/v1/audit-logs').set(authed(roles.superAdmin.token));
    expect(auditRes.status).toBe(200);

    const settingsRes = await request(app).get('/api/v1/settings').set(authed(roles.superAdmin.token));
    expect(settingsRes.status).toBe(200);
  });

  it('Department Head remains pinned to their own department (Registrar cannot see Library data)', async () => {
    const deptRes = await request(app).get('/api/v1/departments').set(authed(roles.registrarHead.token));
    expect(deptRes.body.data.departments).toHaveLength(1);
    expect(deptRes.body.data.departments[0]._id).toBe(registrarDept._id.toString());

    const crossDeptRes = await request(app)
      .get(`/api/v1/departments/${libraryDept._id}`)
      .set(authed(roles.registrarHead.token));
    expect(crossDeptRes.status).toBe(403);

    const feedbackRes = await request(app).get('/api/v1/feedback').set(authed(roles.registrarHead.token));
    expect(feedbackRes.body.data.pagination.total).toBe(8);
  });

  it('Personnel remains pinned to their own department', async () => {
    const tabletRes = await request(app).get('/api/v1/tablets?limit=100').set(authed(roles.libraryStaff.token));
    expect(tabletRes.body.data.pagination.total).toBe(2);

    const settingsRes = await request(app).get('/api/v1/settings').set(authed(roles.libraryStaff.token));
    expect(settingsRes.status).toBe(200);
  });
});
