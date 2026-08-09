import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Location from '../../src/models/Location.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const authed = (token) => ({ Authorization: `Bearer ${token}` });

const listAuditLogs = (token, query = '') =>
  request(app)
    .get(`/api/v1/audit-logs${query}`)
    .set(token ? authed(token) : {});

const getAuditLog = (token, id) =>
  request(app)
    .get(`/api/v1/audit-logs/${id}`)
    .set(token ? authed(token) : {});

let roles;
let registrarDept;
let registrarLoc1;
let createdDepartmentId;
let createdTabletId;
let createdSurveyId;
let createdQuestionId;
let createdPersonnelId;
let linkedUserId;
let regenerateTokenResponseBody;

beforeAll(async () => {
  await resetAndSeed();
  // Each seeded-role login below is itself a real auth.login write path
  // — five genuine audit events, not fixtures.
  roles = await loginAllSeededRoles();

  registrarDept = await Department.findOne({ code: 'REG' });
  registrarLoc1 = await Location.findOne({ code: 'REG-LOC-01' });

  const admin = authed(roles.superAdmin.token);

  const deptRes = await request(app)
    .post('/api/v1/departments')
    .set(admin)
    .send({ name: 'Audit Test Department', code: 'AUD' });
  createdDepartmentId = deptRes.body.data.department._id;
  await request(app)
    .patch(`/api/v1/departments/${createdDepartmentId}`)
    .set(admin)
    .send({ isActive: false });

  await request(app)
    .post('/api/v1/locations')
    .set(admin)
    .send({
      name: 'Audit Test Location',
      code: 'AUD-LOC-01',
      departmentId: registrarDept._id.toString(),
      buildingId: registrarLoc1.buildingId.toString(),
    });

  const personnelRes = await request(app)
    .post('/api/v1/personnel')
    .set(admin)
    .send({
      employeeNumber: 'AUD-0001',
      firstName: 'Audit',
      lastName: 'Tester',
      email: 'audit.tester@fbms.test',
      position: 'QA Tester',
      departmentId: registrarDept._id.toString(),
    });
  createdPersonnelId = personnelRes.body.data.personnel._id;

  // The seeder links 8 of 11 users, so no "linkable-users" candidate is
  // reliably free — instead, free up an already-linked seeded Registrar
  // record's user (a real personnel.unlink event) and link that user to
  // the freshly created test record (a real personnel.link event), then
  // unlink it again so the exercise leaves no dangling link behind.
  const existingRegistrarPersonnelRes = await request(app)
    .get(`/api/v1/personnel?departmentId=${registrarDept._id.toString()}&limit=100`)
    .set(admin);
  const existingLinked = existingRegistrarPersonnelRes.body.data.personnel.find(
    (p) => p.userId && p._id !== createdPersonnelId,
  );

  if (existingLinked) {
    linkedUserId = existingLinked.userId;
    await request(app)
      .patch(`/api/v1/personnel/${existingLinked._id}`)
      .set(admin)
      .send({ userId: null });
    await request(app)
      .patch(`/api/v1/personnel/${createdPersonnelId}`)
      .set(admin)
      .send({ userId: linkedUserId });
    await request(app)
      .patch(`/api/v1/personnel/${createdPersonnelId}`)
      .set(admin)
      .send({ userId: null });
  }

  const tabletRes = await request(app)
    .post('/api/v1/tablets')
    .set(admin)
    .send({
      deviceName: 'Audit Test Tablet',
      deviceCode: 'AUD-TAB-01',
      locationId: registrarLoc1._id.toString(),
    });
  createdTabletId = tabletRes.body.data.tablet._id;
  await request(app)
    .patch(`/api/v1/tablets/${createdTabletId}`)
    .set(admin)
    .send({ notes: 'Updated via audit test.' });
  const regenRes = await request(app)
    .post(`/api/v1/tablets/${createdTabletId}/regenerate-token`)
    .set(admin);
  regenerateTokenResponseBody = regenRes.body;

  const surveyRes = await request(app)
    .post('/api/v1/surveys')
    .set(admin)
    .send({ title: 'Audit Test Survey', departmentId: registrarDept._id.toString() });
  createdSurveyId = surveyRes.body.data.survey._id;
  await request(app)
    .patch(`/api/v1/surveys/${createdSurveyId}`)
    .set(admin)
    .send({ description: 'Updated via audit test.' });

  const questionRes = await request(app)
    .post(`/api/v1/surveys/${createdSurveyId}/questions`)
    .set(admin)
    .send({ questionText: 'Did the audit test work?', questionType: 'yes_no' });
  createdQuestionId = questionRes.body.data.question._id;
  await request(app)
    .patch(`/api/v1/questions/${createdQuestionId}`)
    .set(admin)
    .send({ required: true });

  await request(app).post(`/api/v1/surveys/${createdSurveyId}/publish`).set(admin);
  await request(app).post(`/api/v1/surveys/${createdSurveyId}/unpublish`).set(admin);
  await request(app).post(`/api/v1/surveys/${createdSurveyId}/archive`).set(admin);

  await request(app)
    .patch('/api/v1/settings')
    .set(admin)
    .send({ contactPerson: 'Audit Test Administrator' });

  await request(app)
    .post('/api/v1/settings/logo')
    .set(admin)
    .attach('logo', Buffer.from('fake-png-bytes'), { filename: 'logo.png', contentType: 'image/png' })
    .catch(() => {});
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('Audit Logs authorization', () => {
  it('rejects an unauthenticated list request with 401', async () => {
    const res = await listAuditLogs();
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated detail request with 401', async () => {
    const res = await getAuditLog(undefined, createdDepartmentId);
    expect(res.status).toBe(401);
  });

  it('allows Super Admin to list audit logs', async () => {
    const res = await listAuditLogs(roles.superAdmin.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.auditLogs)).toBe(true);
  });

  it('allows Super Admin to view an audit log detail', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token);
    const target = listRes.body.data.auditLogs[0];
    const res = await getAuditLog(roles.superAdmin.token, target._id);
    expect(res.status).toBe(200);
  });

  it('rejects Department Head list access with 403', async () => {
    const res = await listAuditLogs(roles.registrarHead.token);
    expect(res.status).toBe(403);
  });

  it('rejects Personnel list access with 403', async () => {
    const res = await listAuditLogs(roles.libraryStaff.token);
    expect(res.status).toBe(403);
  });

  it('rejects Department Head detail access with 403', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token);
    const target = listRes.body.data.auditLogs[0];
    const res = await getAuditLog(roles.registrarHead.token, target._id);
    expect(res.status).toBe(403);
  });

  it('rejects Personnel detail access with 403', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token);
    const target = listRes.body.data.auditLogs[0];
    const res = await getAuditLog(roles.libraryStaff.token, target._id);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/audit-logs', () => {
  it('returns audit log entries generated by real write operations', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.length).toBeGreaterThan(0);

    const actions = res.body.data.auditLogs.map((entry) => entry.action);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('department.create');
    expect(actions).toContain('department.deactivate');
    expect(actions).toContain('location.create');
    expect(actions).toContain('personnel.create');
    expect(actions).toContain('personnel.link');
    expect(actions).toContain('personnel.unlink');
    expect(actions).toContain('tablet.create');
    expect(actions).toContain('tablet.update');
    expect(actions).toContain('tablet.regenerate_token');
    expect(actions).toContain('survey.create');
    expect(actions).toContain('survey.update');
    expect(actions).toContain('survey.publish');
    expect(actions).toContain('survey.unpublish');
    expect(actions).toContain('survey.archive');
    expect(actions).toContain('question.create');
    expect(actions).toContain('question.update');
    expect(actions).toContain('settings.update');
  });

  it('sorts newest-first by default', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?limit=100');
    const timestamps = res.body.data.auditLogs.map((entry) => new Date(entry.createdAt).getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it('returns correct pagination metadata', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.length).toBeLessThanOrEqual(5);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.data.pagination.total).toBeGreaterThan(0);
  });

  it('supports the action filter', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?action=tablet.regenerate_token');
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.length).toBeGreaterThan(0);
    expect(res.body.data.auditLogs.every((entry) => entry.action === 'tablet.regenerate_token')).toBe(true);
  });

  it('supports the entityType filter', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?entityType=survey');
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.length).toBeGreaterThan(0);
    expect(res.body.data.auditLogs.every((entry) => entry.entityType === 'survey')).toBe(true);
  });

  it('supports the departmentId filter', async () => {
    const res = await listAuditLogs(
      roles.superAdmin.token,
      `?departmentId=${registrarDept._id.toString()}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.length).toBeGreaterThan(0);
    expect(
      res.body.data.auditLogs.every((entry) => entry.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('supports the outcome filter', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?outcome=success');
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.every((entry) => entry.outcome === 'success')).toBe(true);
  });

  it('supports search across actor email and entity label', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?search=superadmin@fbms.test');
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs.length).toBeGreaterThan(0);
    expect(
      res.body.data.auditLogs.every((entry) => entry.actorEmail === 'superadmin@fbms.test'),
    ).toBe(true);
  });

  it('supports dateFrom/dateTo filtering on createdAt', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await listAuditLogs(roles.superAdmin.token, `?dateFrom=${future}`);
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs).toHaveLength(0);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('returns an empty result for a filter combination that matches nothing', async () => {
    const res = await listAuditLogs(
      roles.superAdmin.token,
      '?entityType=question&action=survey.create',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.auditLogs).toHaveLength(0);
  });

  it('rejects an invalid actorUserId with 400', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?actorUserId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid departmentId with 400', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?departmentId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized action with 400', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?action=not.a.real.action');
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized entityType with 400', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?entityType=not-a-real-type');
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized outcome with 400', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?outcome=maybe');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid dateFrom with 400', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?dateFrom=not-a-date');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/audit-logs/:id', () => {
  it('retrieves a single audit log entry by id', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token, '?action=department.create&limit=1');
    const target = listRes.body.data.auditLogs[0];

    const res = await getAuditLog(roles.superAdmin.token, target._id);
    expect(res.status).toBe(200);
    expect(res.body.data.auditLog._id).toBe(target._id);
    expect(res.body.data.auditLog.action).toBe('department.create');
    expect(res.body.data.auditLog.entityLabel).toBe('Audit Test Department');
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getAuditLog(roles.superAdmin.token, '64b000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed id', async () => {
    const res = await getAuditLog(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });
});

describe('Audit Logs immutability', () => {
  it('has no POST endpoint for manually creating an audit log', async () => {
    const res = await request(app)
      .post('/api/v1/audit-logs')
      .set(authed(roles.superAdmin.token))
      .send({ action: 'department.create' });
    expect(res.status).toBe(404);
  });

  it('has no PATCH endpoint for editing an audit log', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token, '?limit=1');
    const target = listRes.body.data.auditLogs[0];
    const res = await request(app)
      .patch(`/api/v1/audit-logs/${target._id}`)
      .set(authed(roles.superAdmin.token))
      .send({ action: 'tampered' });
    expect(res.status).toBe(404);
  });

  it('has no DELETE endpoint for removing an audit log', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token, '?limit=1');
    const target = listRes.body.data.auditLogs[0];
    const res = await request(app)
      .delete(`/api/v1/audit-logs/${target._id}`)
      .set(authed(roles.superAdmin.token));
    expect(res.status).toBe(404);
  });

  it('has no bulk-delete endpoint', async () => {
    const res = await request(app)
      .delete('/api/v1/audit-logs')
      .set(authed(roles.superAdmin.token));
    expect(res.status).toBe(404);
  });
});

describe('Audit Logs security review', () => {
  const SENSITIVE_STRINGS = [
    'password',
    'passwordHash',
    'activationToken',
    'deviceSecretHash',
    'authorization',
    'jwt',
  ];

  it('never records a tablet activation token value when regenerate-token is instrumented', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?action=tablet.regenerate_token&limit=1');
    const entry = res.body.data.auditLogs[0];
    const detailRes = await getAuditLog(roles.superAdmin.token, entry._id);

    const serialized = JSON.stringify(detailRes.body);
    const issuedToken = regenerateTokenResponseBody?.data?.tablet?.activationToken;

    expect(issuedToken).toBeTruthy();
    expect(serialized).not.toContain(issuedToken);
  });

  it('never exposes password/token/hash fields anywhere in the list or detail response', async () => {
    const listRes = await listAuditLogs(roles.superAdmin.token, '?limit=100');
    const listSerialized = JSON.stringify(listRes.body).toLowerCase();

    SENSITIVE_STRINGS.forEach((needle) => {
      expect(listSerialized).not.toContain(needle.toLowerCase());
    });

    const target = listRes.body.data.auditLogs[0];
    const detailRes = await getAuditLog(roles.superAdmin.token, target._id);
    const detailSerialized = JSON.stringify(detailRes.body).toLowerCase();

    SENSITIVE_STRINGS.forEach((needle) => {
      expect(detailSerialized).not.toContain(needle.toLowerCase());
    });
  });

  it('metadata never contains raw request-body dumps (only field names, never values, for update actions)', async () => {
    const res = await listAuditLogs(roles.superAdmin.token, '?action=settings.update&limit=1');
    const entry = res.body.data.auditLogs[0];

    expect(entry.metadata).toBeTruthy();
    expect(entry.metadata.changedFields).toContain('contactPerson');
    expect(JSON.stringify(entry.metadata)).not.toContain('Audit Test Administrator');
  });
});
