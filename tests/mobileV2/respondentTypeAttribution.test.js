import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import Department from '../../src/models/Department.js';
import ServiceType from '../../src/models/ServiceType.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const staffLogin = (headers, pin) =>
  request(app).post('/api/v2/mobile/staff/login').set(headers ?? {}).send({ pin });

const submitFeedbackV2 = (headers, body) =>
  request(app).post('/api/v2/mobile/feedback').set(headers ?? {}).send(body ?? {});

const submitFeedbackV1 = (headers, body) =>
  request(app).post('/api/v1/mobile/feedback').set(headers ?? {}).send(body ?? {});

const getRespondentTypesV2 = (headers) =>
  request(app).get('/api/v2/mobile/respondent-types').set(headers ?? {});

let deviceSecret;
let registrarSurvey;
let registrarQuestions;
let registrarServiceType;

function buildValidPayload(overrides = {}) {
  return {
    surveyId: registrarSurvey._id.toString(),
    submittedAt: '2026-08-06T09:00:00.000Z',
    completedAt: '2026-08-06T09:02:00.000Z',
    serviceTypeId: registrarServiceType._id.toString(),
    respondentType: 'student',
    answers: registrarQuestions.map((question) => ({
      questionId: question._id.toString(),
      answer:
        question.questionType === 'multiple_choice'
          ? question.options[0]
          : question.questionType === 'yes_no'
            ? true
            : question.questionType === 'rating'
              ? 5
              : 'Great service.',
    })),
    ...overrides,
  };
}

beforeAll(async () => {
  await resetAndSeed();
  ({ deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
  registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
  registrarQuestions = await Question.find({ surveyId: registrarSurvey._id }).sort({ order: 1 });
  const registrarDept = await Department.findOne({ code: 'REG' });
  registrarServiceType = await ServiceType.findOne({ departmentId: registrarDept._id, code: 'REG-SVC-01' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v2/mobile/respondent-types', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getRespondentTypesV2();
    expect(res.status).toBe(401);
  });

  it('returns the fixed value/label list, identical regardless of the requesting tablet\'s department', async () => {
    const res = await getRespondentTypesV2(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.respondentTypes).toEqual([
      { value: 'student', label: 'Student' },
      { value: 'employee', label: 'Employee' },
      { value: 'visitor', label: 'Visitor' },
    ]);
  });
});

describe('POST /api/v2/mobile/feedback — V2.7 respondent type attribution', () => {
  it('accepts a submission with no respondentType at all (optional on v2)', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const payload = buildValidPayload();
    delete payload.respondentType;

    const res = await submitFeedbackV2(deviceAuthHeader(deviceSecret), payload);

    expect(res.status).toBe(201);
    expect(res.body.data.feedbackSession.respondentType).toBeNull();

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  it('rejects an invalid respondentType value with 400', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const res = await submitFeedbackV2(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ respondentType: 'alumni' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'respondentType')).toBe(true);

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  let attributedSessionId;

  it.each(['student', 'employee', 'visitor'])('accepts a valid respondentType "%s" and persists it', async (value) => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const res = await submitFeedbackV2(deviceAuthHeader(deviceSecret), buildValidPayload({ respondentType: value }));

    expect(res.status).toBe(201);
    expect(res.body.data.feedbackSession.respondentType).toBe(value);
    attributedSessionId = res.body.data.feedbackSession._id;

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  it('the persisted respondentType is readable back from the stored document', async () => {
    const stored = await FeedbackSession.findById(attributedSessionId);
    expect(stored.respondentType).toBe('visitor');
  });
});

describe('POST /api/v1/mobile/feedback — V1 preserved exactly', () => {
  it('rejects a client-supplied respondentType as an unknown field (v1 has no such concept)', async () => {
    const payload = buildValidPayload();
    delete payload.serviceTypeId;

    const res = await submitFeedbackV1(deviceAuthHeader(deviceSecret), payload);

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'respondentType')).toBe(true);
  });

  it('succeeds without respondentType and stores respondentType: null', async () => {
    const payload = buildValidPayload();
    delete payload.serviceTypeId;
    delete payload.respondentType;

    const res = await submitFeedbackV1(deviceAuthHeader(deviceSecret), payload);

    expect(res.status).toBe(201);
    expect(res.body.data.feedbackSession.respondentType).toBeNull();
  });
});
