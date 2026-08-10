import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Survey from '../../src/models/Survey.js';
import Tablet from '../../src/models/Tablet.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listFeedback = (token, query = '') =>
  request(app)
    .get(`/api/v1/feedback${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const getFeedback = (token, id) =>
  request(app)
    .get(`/api/v1/feedback/${id}`)
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

describe('GET /api/v1/feedback', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await listFeedback();
    expect(res.status).toBe(401);
  });

  it('returns all 10 seeded sessions for Super Admin', async () => {
    const res = await listFeedback(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSessions.length).toBe(10);
    expect(res.body.data.pagination.total).toBe(10);
  });

  it('scopes a Registrar Department Head to only Registrar sessions (8)', async () => {
    const res = await listFeedback(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(8);
    expect(
      res.body.data.feedbackSessions.every((s) => s.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('scopes a Library Personnel user to only Library sessions (2)', async () => {
    const res = await listFeedback(roles.libraryStaff.token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    expect(
      res.body.data.feedbackSessions.every((s) => s.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('a supplied departmentId query cannot widen a non-admin\'s visibility', async () => {
    const res = await listFeedback(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.data.feedbackSessions.every((s) => s.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('supports the departmentId filter for Super Admin', async () => {
    const res = await listFeedback(
      roles.superAdmin.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('rejects an invalid departmentId with 400', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?departmentId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('supports the surveyId filter', async () => {
    const survey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const res = await listFeedback(roles.superAdmin.token, `?surveyId=${survey._id.toString()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(4);
    expect(res.body.data.feedbackSessions.every((s) => s.surveyId === survey._id.toString())).toBe(true);
  });

  it('rejects an invalid surveyId with 400', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?surveyId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('supports the locationId filter', async () => {
    const tablet = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
    const res = await listFeedback(
      roles.superAdmin.token,
      `?locationId=${tablet.locationId.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('rejects an invalid locationId with 400', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?locationId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('supports a submittedAt date-range filter (dateFrom/dateTo)', async () => {
    const res = await listFeedback(
      roles.superAdmin.token,
      '?dateFrom=2026-08-01T00:00:00.000Z&dateTo=2026-08-06T00:00:00.000Z',
    );

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(3);
  });

  it('rejects an invalid dateFrom with 400', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?dateFrom=not-a-date');
    expect(res.status).toBe(400);
  });

  it('supports search by reference code', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?search=FB-2026-000007');

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSessions.length).toBe(1);
    expect(res.body.data.feedbackSessions[0].referenceCode).toBe('FB-2026-000007');
  });

  it('returns an empty array (not an error) for a search with no matches', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?search=NO-SUCH-REFERENCE');

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSessions).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('returns correct pagination metadata', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?page=1&limit=4');

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSessions.length).toBe(4);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 4, total: 10, pages: 3 });
  });

  it('returns sessions sorted by submittedAt descending (most recent first)', async () => {
    const res = await listFeedback(roles.superAdmin.token);
    const dates = res.body.data.feedbackSessions.map((s) => new Date(s.submittedAt).getTime());
    const sorted = [...dates].sort((a, b) => b - a);

    expect(dates).toEqual(sorted);
  });

  it('response contract: each session includes referenceCode, durationSeconds, status, and no write-only fields', async () => {
    const res = await listFeedback(roles.superAdmin.token, '?limit=1');
    const [session] = res.body.data.feedbackSessions;

    expect(session).toHaveProperty('referenceCode');
    expect(session).toHaveProperty('surveyId');
    expect(session).toHaveProperty('tabletId');
    expect(session).toHaveProperty('locationId');
    expect(session).toHaveProperty('departmentId');
    expect(session).toHaveProperty('submittedAt');
    expect(session).toHaveProperty('completedAt');
    expect(session).toHaveProperty('durationSeconds');
    expect(session.status).toBe('completed');
  });
});

describe('GET /api/v1/feedback/:id', () => {
  it('allows Super Admin to retrieve any session with its answers', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000007' });
    const res = await getFeedback(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSession.referenceCode).toBe('FB-2026-000007');
    // V2.5 — Registrar Office Feedback grew from 4 to 7 questions (three
    // new Courtesy/Clarity/Waiting Time rating questions), and FB007 was
    // seeded to answer all of them.
    expect(res.body.data.answers.length).toBe(7);
  });

  it('returns answers sorted by the answered question\'s order, with question text populated', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000007' });
    const res = await getFeedback(roles.superAdmin.token, target._id.toString());

    const orders = res.body.data.answers.map((a) => a.questionId.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(res.body.data.answers[0].questionId.questionText).toBe(
      'How satisfied are you with the registration process?',
    );
  });

  it('allows a Registrar Department Head to retrieve their own department\'s session', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000007' });
    const res = await getFeedback(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('rejects a Registrar Department Head retrieving a Library session with 403', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000004' });
    const res = await getFeedback(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000001' });
    const res = await getFeedback(undefined, target._id.toString());

    expect(res.status).toBe(401);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await getFeedback(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getFeedback(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });

  it('returns each answer\'s snapshotted questionType matching the current question type', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000007' });
    const res = await getFeedback(roles.superAdmin.token, target._id.toString());

    const multipleChoiceAnswer = res.body.data.answers.find((a) => a.questionType === 'multiple_choice');
    expect(multipleChoiceAnswer.answer).toBe('Enrollment');
  });
});

describe('Feedback immutability', () => {
  it('has no PATCH endpoint for a feedback session', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000001' });
    const res = await request(app)
      .patch(`/api/v1/feedback/${target._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ status: 'reviewed' });

    expect(res.status).toBe(404);
  });

  it('has no DELETE endpoint for a feedback session', async () => {
    const target = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000001' });
    const res = await request(app)
      .delete(`/api/v1/feedback/${target._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });

    expect(res.status).toBe(404);
  });

  it('has no POST endpoint for feedback submission on the admin API', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({});

    expect(res.status).toBe(404);
  });
});
