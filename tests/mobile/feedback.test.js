import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import Tablet from '../../src/models/Tablet.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import FeedbackAnswer from '../../src/models/FeedbackAnswer.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const submitFeedback = (headers, body) =>
  request(app).post('/api/v1/mobile/feedback').set(headers ?? {}).send(body ?? {});

let deviceSecret;
let registrarSurvey;
let registrarQuestions;
let tablet;
let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  ({ deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
  tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
  registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
  registrarQuestions = await Question.find({ surveyId: registrarSurvey._id }).sort({ order: 1 });
});

afterAll(async () => {
  await disconnectTestDb();
});

function buildValidPayload(overrides = {}) {
  const [rating, multipleChoice, yesNo, shortText] = registrarQuestions;

  return {
    surveyId: registrarSurvey._id.toString(),
    submittedAt: '2026-08-06T09:00:00.000Z',
    completedAt: '2026-08-06T09:02:00.000Z',
    answers: [
      { questionId: rating._id.toString(), answer: 5 },
      { questionId: multipleChoice._id.toString(), answer: multipleChoice.options[0] },
      { questionId: yesNo._id.toString(), answer: true },
      { questionId: shortText._id.toString(), answer: 'Great service.' },
    ],
    ...overrides,
  };
}

describe('POST /api/v1/mobile/feedback', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await submitFeedback(undefined, buildValidPayload());
    expect(res.status).toBe(401);
  });

  it('rejects a malformed payload — missing surveyId/answers', async () => {
    const res = await submitFeedback(deviceAuthHeader(deviceSecret), {});
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'surveyId')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'answers')).toBe(true);
  });

  it('rejects a client-supplied departmentId/locationId as an unknown field', async () => {
    const res = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ departmentId: 'x', locationId: 'y' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'departmentId')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'locationId')).toBe(true);
  });

  it('rejects a surveyId that does not match the currently active survey with 409', async () => {
    const globalSurvey = await Survey.findOne({ title: 'General Service Feedback' });
    const res = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ surveyId: globalSurvey._id.toString() }),
    );

    expect(res.status).toBe(409);
  });

  it('rejects an answer referencing a question outside the active survey', async () => {
    const globalSurvey = await Survey.findOne({ title: 'General Service Feedback' });
    const foreignQuestion = await Question.findOne({ surveyId: globalSurvey._id });

    const res = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({
        answers: [{ questionId: foreignQuestion._id.toString(), answer: 5 }],
      }),
    );

    expect(res.status).toBe(400);
  });

  it('rejects a submission missing an answer for a required question', async () => {
    const [rating] = registrarQuestions;
    const res = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ answers: [{ questionId: rating._id.toString(), answer: 5 }] }),
    );

    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range rating answer (answer validation reused from P5.0)', async () => {
    const [rating] = registrarQuestions;
    const res = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ answers: buildValidPayload().answers.map((a) =>
        a.questionId === rating._id.toString() ? { ...a, answer: 9 } : a,
      ) }),
    );

    expect(res.status).toBe(400);
  });

  it('rejects a multiple_choice answer not among the question\'s options', async () => {
    const multipleChoice = registrarQuestions.find((q) => q.questionType === 'multiple_choice');
    const res = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({
        answers: buildValidPayload().answers.map((a) =>
          a.questionId === multipleChoice._id.toString() ? { ...a, answer: 'Not A Real Option' } : a,
        ),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('creates a FeedbackSession and FeedbackAnswers on a valid submission, deriving department/location from the tablet', async () => {
    const before = await FeedbackSession.countDocuments();
    const res = await submitFeedback(deviceAuthHeader(deviceSecret), buildValidPayload());

    expect(res.status).toBe(201);
    expect(await FeedbackSession.countDocuments()).toBe(before + 1);

    const session = res.body.data.feedbackSession;
    expect(session.departmentId).toBe(tablet.departmentId.toString());
    expect(session.locationId).toBe(tablet.locationId.toString());
    expect(session.tabletId).toBe(tablet._id.toString());
    expect(session.durationSeconds).toBe(120);
    expect(session.referenceCode).toMatch(/^FB-2026-0000\d{2}$/);

    const answers = await FeedbackAnswer.find({ feedbackSessionId: session._id });
    expect(answers.length).toBe(4);
  });

  it('the created session is immediately visible through the existing admin GET /api/v1/feedback endpoint (P5.0 compatibility)', async () => {
    const listRes = await request(app)
      .get('/api/v1/feedback?limit=100')
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.pagination.total).toBeGreaterThanOrEqual(11);

    const createdSession = await FeedbackSession.findOne().sort({ createdAt: -1 });
    const detailRes = await request(app)
      .get(`/api/v1/feedback/${createdSession._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.answers.length).toBe(4);
  });

  it('continues the reference-code sequence started by the seeder without collision', async () => {
    const secondSubmission = await submitFeedback(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ submittedAt: '2026-08-06T10:00:00.000Z', completedAt: '2026-08-06T10:01:30.000Z' }),
    );

    expect(secondSubmission.status).toBe(201);

    const codes = (await FeedbackSession.find().select('referenceCode')).map((s) => s.referenceCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
