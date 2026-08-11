import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import Department from '../../src/models/Department.js';
import ServiceType from '../../src/models/ServiceType.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const staffLogin = (headers, pin) =>
  request(app).post('/api/v2/mobile/staff/login').set(headers ?? {}).send({ pin });

const submitFeedbackV2 = (headers, body) =>
  request(app).post('/api/v2/mobile/feedback').set(headers ?? {}).send(body ?? {});

const submitFeedbackV1 = (headers, body) =>
  request(app).post('/api/v1/mobile/feedback').set(headers ?? {}).send(body ?? {});

const getServiceTypesV2 = (headers) =>
  request(app).get('/api/v2/mobile/service-types').set(headers ?? {});

let deviceSecret;
let registrarSurvey;
let registrarQuestions;
let registrarDept;
let libraryDept;
let registrarServiceType;
let libraryServiceType;
let roles;

function buildValidPayload(overrides = {}) {
  return {
    surveyId: registrarSurvey._id.toString(),
    submittedAt: '2026-08-06T09:00:00.000Z',
    completedAt: '2026-08-06T09:02:00.000Z',
    serviceTypeId: registrarServiceType._id.toString(),
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
  roles = await loginAllSeededRoles();
  ({ deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
  registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
  registrarQuestions = await Question.find({ surveyId: registrarSurvey._id }).sort({ order: 1 });
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
  registrarServiceType = await ServiceType.findOne({ departmentId: registrarDept._id, code: 'REG-SVC-01' });
  libraryServiceType = await ServiceType.findOne({ departmentId: libraryDept._id, code: 'LIB-SVC-01' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v2/mobile/service-types', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getServiceTypesV2();
    expect(res.status).toBe(401);
  });

  it("returns only the tablet's own department's active service types", async () => {
    const res = await getServiceTypesV2(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.serviceTypes.length).toBe(6);
    expect(
      res.body.data.serviceTypes.every((s) => s.departmentId === registrarDept._id.toString()),
    ).toBe(true);
    expect(res.body.data.serviceTypes.every((s) => s.isActive)).toBe(true);
  });
});

describe('POST /api/v2/mobile/feedback — V2.6 service type attribution', () => {
  it('rejects submission missing serviceTypeId with 400 (required on v2)', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const payload = buildValidPayload();
    delete payload.serviceTypeId;

    const res = await submitFeedbackV2(deviceAuthHeader(deviceSecret), payload);

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'serviceTypeId')).toBe(true);

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  it('rejects a nonexistent serviceTypeId with 400', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const res = await submitFeedbackV2(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ serviceTypeId: '507f1f77bcf86cd799439011' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'serviceTypeId')).toBe(true);

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  it('rejects an inactive serviceTypeId with 400', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const inactiveServiceType = await ServiceType.findOne({ departmentId: registrarDept._id });
    inactiveServiceType.isActive = false;
    await inactiveServiceType.save();

    const res = await submitFeedbackV2(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ serviceTypeId: inactiveServiceType._id.toString() }),
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'serviceTypeId')).toBe(true);

    inactiveServiceType.isActive = true;
    await inactiveServiceType.save();
    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  it('rejects a cross-department serviceTypeId with 400 (a Registrar tablet cannot attribute a Library service type)', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const res = await submitFeedbackV2(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ serviceTypeId: libraryServiceType._id.toString() }),
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'serviceTypeId')).toBe(true);

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  let attributedSessionId;

  it('accepts a valid, active, correct-department serviceTypeId and persists it', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const res = await submitFeedbackV2(deviceAuthHeader(deviceSecret), buildValidPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.feedbackSession.serviceTypeId).toBe(registrarServiceType._id.toString());
    attributedSessionId = res.body.data.feedbackSession._id;

    await request(app).post('/api/v2/mobile/staff/logout').set(deviceAuthHeader(deviceSecret));
  });

  it('a later deactivation of the service type does not corrupt the already-submitted feedback session (historical integrity)', async () => {
    registrarServiceType.isActive = false;
    await registrarServiceType.save();

    const stored = await FeedbackSession.findById(attributedSessionId);
    expect(stored.serviceTypeId.toString()).toBe(registrarServiceType._id.toString());

    const res = await request(app)
      .get(`/api/v1/feedback/${attributedSessionId}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSession.serviceTypeId).toBe(registrarServiceType._id.toString());

    registrarServiceType.isActive = true;
    await registrarServiceType.save();
  });

  it("a later rename of the service type does not change the historical snapshot's referenced id", async () => {
    registrarServiceType.name = 'Renamed For Historical Test';
    await registrarServiceType.save();

    const stored = await FeedbackSession.findById(attributedSessionId);
    expect(stored.serviceTypeId.toString()).toBe(registrarServiceType._id.toString());
  });
});

describe('POST /api/v1/mobile/feedback — V1 preserved exactly', () => {
  it('rejects a client-supplied serviceTypeId as an unknown field (v1 has no such concept)', async () => {
    const payload = buildValidPayload();

    const res = await submitFeedbackV1(deviceAuthHeader(deviceSecret), payload);

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'serviceTypeId')).toBe(true);
  });

  it('succeeds without serviceTypeId and stores serviceTypeId: null', async () => {
    const payload = buildValidPayload();
    delete payload.serviceTypeId;

    const res = await submitFeedbackV1(deviceAuthHeader(deviceSecret), payload);

    expect(res.status).toBe(201);
    expect(res.body.data.feedbackSession.serviceTypeId).toBeNull();
  });
});
