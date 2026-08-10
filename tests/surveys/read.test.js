import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Survey from '../../src/models/Survey.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listSurveys = (token, query = '') =>
  request(app)
    .get(`/api/v1/surveys${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getSurvey = (token, id) =>
  request(app)
    .get(`/api/v1/surveys/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const listQuestions = (token, id) =>
  request(app)
    .get(`/api/v1/surveys/${id}/questions`)
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

describe('GET /api/v1/surveys', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await listSurveys();
    expect(res.status).toBe(401);
  });

  it('returns all 3 seeded surveys for Super Admin', async () => {
    const res = await listSurveys(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.surveys.length).toBe(3);
    expect(res.body.data.pagination.total).toBe(3);
  });

  it('returns Global + own department surveys for a Registrar Department Head', async () => {
    const res = await listSurveys(roles.registrarHead.token);

    expect(res.status).toBe(200);
    const titles = res.body.data.surveys.map((s) => s.title);
    expect(titles).toContain('General Service Feedback');
    expect(titles).toContain('Registrar Office Feedback');
    expect(titles).not.toContain('Library Services Feedback');
  });

  it('returns Global + own department surveys for a Library Personnel user', async () => {
    const res = await listSurveys(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    const titles = res.body.data.surveys.map((s) => s.title);
    expect(titles).toContain('General Service Feedback');
    expect(titles).toContain('Library Services Feedback');
    expect(titles).not.toContain('Registrar Office Feedback');
  });

  it('a supplied departmentId query cannot widen a non-admin\'s visibility', async () => {
    const res = await listSurveys(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    const titles = res.body.data.surveys.map((s) => s.title);
    expect(titles).not.toContain('Library Services Feedback');
  });

  it('supports the departmentId filter for Super Admin', async () => {
    const res = await listSurveys(
      roles.superAdmin.token,
      `?departmentId=${registrarDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.surveys.every((s) => s.departmentId === registrarDept._id.toString())).toBe(
      true,
    );
  });

  it('supports the isPublished filter', async () => {
    const res = await listSurveys(roles.superAdmin.token, '?isPublished=false');

    expect(res.status).toBe(200);
    expect(res.body.data.surveys.length).toBe(1);
    expect(res.body.data.surveys[0].title).toBe('Library Services Feedback');
  });

  it('supports search across title/description', async () => {
    const res = await listSurveys(roles.superAdmin.token, '?search=Registrar');

    expect(res.status).toBe(200);
    expect(res.body.data.surveys.length).toBe(1);
    expect(res.body.data.surveys[0].title).toBe('Registrar Office Feedback');
  });

  it('returns each survey\'s assignmentType and status virtuals', async () => {
    const res = await listSurveys(roles.superAdmin.token);

    const global = res.body.data.surveys.find((s) => s.title === 'General Service Feedback');
    const registrar = res.body.data.surveys.find((s) => s.title === 'Registrar Office Feedback');
    const library = res.body.data.surveys.find((s) => s.title === 'Library Services Feedback');

    expect(global.assignmentType).toBe('global');
    expect(global.status).toBe('published');
    expect(registrar.assignmentType).toBe('department');
    expect(registrar.status).toBe('published');
    expect(library.status).toBe('draft');
  });

  it('rejects an invalid departmentId with 400', async () => {
    const res = await listSurveys(roles.superAdmin.token, '?departmentId=not-a-valid-id');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/surveys/:id', () => {
  it('allows Super Admin to retrieve any survey', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await getSurvey(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.survey.title).toBe('Library Services Feedback');
  });

  it('allows a Department Head to retrieve a Global survey', async () => {
    const target = await Survey.findOne({ title: 'General Service Feedback' });
    const res = await getSurvey(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('allows a Department Head to retrieve their own department survey', async () => {
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const res = await getSurvey(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('rejects a Department Head retrieving another department survey with 403', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await getSurvey(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await getSurvey(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getSurvey(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/surveys/:id/questions', () => {
  it('returns questions sorted by order for an authorized viewer', async () => {
    const survey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const res = await listQuestions(roles.superAdmin.token, survey._id.toString());

    expect(res.status).toBe(200);
    // V2.5 — grew from 4 to 7 questions (three new Courtesy/Clarity/
    // Waiting Time rating questions appended at order 5-7).
    expect(res.body.data.questions.length).toBe(7);
    expect(res.body.data.questions.map((q) => q.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects a Department Head requesting questions for another department\'s survey with 403', async () => {
    const survey = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await listQuestions(roles.registrarHead.token, survey._id.toString());

    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const survey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const res = await listQuestions(undefined, survey._id.toString());

    expect(res.status).toBe(401);
  });
});
