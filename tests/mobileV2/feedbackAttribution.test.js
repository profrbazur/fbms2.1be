import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import Personnel from '../../src/models/Personnel.js';
import Department from '../../src/models/Department.js';
import ServiceType from '../../src/models/ServiceType.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const staffLogin = (headers, pin) =>
  request(app).post('/api/v2/mobile/staff/login').set(headers ?? {}).send({ pin });

const staffLogout = (headers) =>
  request(app).post('/api/v2/mobile/staff/logout').set(headers ?? {}).send();

const submitFeedbackV1 = (headers, body) =>
  request(app).post('/api/v1/mobile/feedback').set(headers ?? {}).send(body ?? {});

const submitFeedbackV2 = (headers, body) =>
  request(app).post('/api/v2/mobile/feedback').set(headers ?? {}).send(body ?? {});

let deviceSecret;
let registrarSurvey;
let registrarQuestions;
let registrarServiceType;
let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  ({ deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
  registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
  registrarQuestions = await Question.find({ surveyId: registrarSurvey._id }).sort({ order: 1 });
  const registrarDept = await Department.findOne({ code: 'REG' });
  // V2.6 — POST /api/v2/mobile/feedback now requires serviceTypeId; any
  // active Registrar service type works for this file's attribution
  // scenarios, which are not about Service Type behavior itself (see
  // tests/mobileV2/serviceTypeAttribution.test.js for that coverage).
  registrarServiceType = await ServiceType.findOne({ departmentId: registrarDept._id, code: 'REG-SVC-01' });
});

afterAll(async () => {
  await disconnectTestDb();
});

// V2.5 — Registrar Office Feedback grew from 4 to 7 questions (three new
// required Courtesy/Clarity/Waiting Time rating questions were added, see
// surveySeeder.js). Answers every currently-loaded question rather than
// hardcoding a fixed 4, matching what a real client does.
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

describe('POST /api/v2/mobile/feedback — historical attribution', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await submitFeedbackV2(undefined, buildValidPayload());
    expect(res.status).toBe(401);
  });

  it('rejects submission with 409 when no staff member is currently serving', async () => {
    const res = await submitFeedbackV2(deviceAuthHeader(deviceSecret), buildValidPayload());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/staff member must log in/i);
  });

  it('rejects a client-supplied personnelId/serviceSessionId as an unknown field (cannot be spoofed)', async () => {
    await staffLogin(deviceAuthHeader(deviceSecret), '111001');

    const res = await submitFeedbackV2(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ personnelId: '507f1f77bcf86cd799439011', serviceSessionId: '507f1f77bcf86cd799439011' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'personnelId')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'serviceSessionId')).toBe(true);

    await staffLogout(deviceAuthHeader(deviceSecret));
  });

  let firstAttributedSessionId;

  it('attributes feedback to the currently active staff member on successful submission', async () => {
    const loginRes = await staffLogin(deviceAuthHeader(deviceSecret), '111001');
    expect(loginRes.status).toBe(201);
    const activeServiceSessionId = loginRes.body.data.serviceSession._id;
    const registrarHeadPersonnel = await Personnel.findOne({ employeeNumber: 'REG-0001' });

    const res = await submitFeedbackV2(deviceAuthHeader(deviceSecret), buildValidPayload());

    expect(res.status).toBe(201);
    const session = res.body.data.feedbackSession;
    expect(session.serviceSessionId).toBe(activeServiceSessionId);
    expect(session.personnelId._id ?? session.personnelId).toBe(registrarHeadPersonnel._id.toString());
    expect(session.buildingId).toBeTruthy();

    firstAttributedSessionId = session._id;

    await staffLogout(deviceAuthHeader(deviceSecret));
  });

  it('a subsequent staff login on the same tablet does not change the already-submitted feedback session', async () => {
    const loginRes = await staffLogin(deviceAuthHeader(deviceSecret), '111002');
    expect(loginRes.status).toBe(201);
    const newSessionId = loginRes.body.data.serviceSession._id;

    const secondSubmission = await submitFeedbackV2(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ submittedAt: '2026-08-06T10:00:00.000Z', completedAt: '2026-08-06T10:01:00.000Z' }),
    );
    expect(secondSubmission.status).toBe(201);
    expect(secondSubmission.body.data.feedbackSession.serviceSessionId).toBe(newSessionId);

    const firstSessionRecord = await FeedbackSession.findById(firstAttributedSessionId);
    const registrarHeadPersonnel = await Personnel.findOne({ employeeNumber: 'REG-0001' });
    expect(firstSessionRecord.personnelId.toString()).toBe(registrarHeadPersonnel._id.toString());
    expect(firstSessionRecord.serviceSessionId.toString()).not.toBe(newSessionId);

    await staffLogout(deviceAuthHeader(deviceSecret));
  });

  it('an ended ServiceSession retains its attribution on already-submitted feedback, visible via the admin API', async () => {
    const res = await request(app)
      .get(`/api/v1/feedback/${firstAttributedSessionId}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });

    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSession.personnelId).toBeTruthy();
    expect(res.body.data.feedbackSession.personnelId.employeeNumber).toBe('REG-0001');
  });

  it('v1 feedback submissions remain unattributed (personnelId/serviceSessionId null) and stay readable', async () => {
    // V2.6 — serviceTypeId is a v2-only concept; v1's contract stays
    // exactly as it was, so it must be stripped before calling v1 (v1
    // rejects it as an unknown field, same as personnelId/serviceSessionId).
    const payload = buildValidPayload({ submittedAt: '2026-08-06T11:00:00.000Z', completedAt: '2026-08-06T11:01:00.000Z' });
    delete payload.serviceTypeId;

    const res = await submitFeedbackV1(deviceAuthHeader(deviceSecret), payload);
    expect(res.status).toBe(201);
    expect(res.body.data.feedbackSession.personnelId).toBeNull();
    expect(res.body.data.feedbackSession.serviceSessionId).toBeNull();

    const detailRes = await request(app)
      .get(`/api/v1/feedback/${res.body.data.feedbackSession._id}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.feedbackSession.personnelId).toBeNull();
  });

  it('pre-V2.4 seeded feedback (no ServiceSession) remains readable with null attribution', async () => {
    // FB-2026-000006 through 000010 are deliberately left unattributed by
    // feedbackSeeder.js.
    const legacySession = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000006' });
    expect(legacySession.personnelId).toBeNull();

    const res = await request(app)
      .get(`/api/v1/feedback/${legacySession._id}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSession.personnelId).toBeNull();
  });

  it('seeded historically-attributed feedback (FB-2026-000001) shows its ServiceSession-era Personnel', async () => {
    const attributedSession = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000001' });
    expect(attributedSession.personnelId).toBeTruthy();

    const res = await request(app)
      .get(`/api/v1/feedback/${attributedSession._id}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(res.status).toBe(200);
    expect(res.body.data.feedbackSession.personnelId.employeeNumber).toBe('REG-0002');
  });
});
