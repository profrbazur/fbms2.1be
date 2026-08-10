import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import Tablet from '../../src/models/Tablet.js';
import Personnel from '../../src/models/Personnel.js';
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
    const res = await submitFeedbackV1(
      deviceAuthHeader(deviceSecret),
      buildValidPayload({ submittedAt: '2026-08-06T11:00:00.000Z', completedAt: '2026-08-06T11:01:00.000Z' }),
    );
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
