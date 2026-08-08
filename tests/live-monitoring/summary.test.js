import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import Survey from '../../src/models/Survey.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getSummary = (token) =>
  request(app)
    .get('/api/v1/live-monitoring/summary')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/live-monitoring/summary', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getSummary();
    expect(res.status).toBe(401);
  });

  it('all 4 seeded tablets are Offline by default (isActive: true, lastSeen: never recorded)', async () => {
    const res = await getSummary(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.offlineCount).toBe(4);
    expect(res.body.data.summary.onlineCount).toBe(0);
    expect(res.body.data.summary.inactiveCount).toBe(0);
  });

  describe('status counts react to heartbeat/activation state', () => {
    afterEach(async () => {
      await Tablet.updateMany({}, { $set: { lastSeen: null, isActive: true } });
    });

    it('counts a recently-heartbeat tablet as Online', async () => {
      await Tablet.updateOne({ deviceCode: 'REG-TAB-01' }, { $set: { lastSeen: new Date() } });

      const res = await getSummary(roles.superAdmin.token);

      expect(res.body.data.summary.onlineCount).toBe(1);
      expect(res.body.data.summary.offlineCount).toBe(3);
    });

    it('counts a deactivated tablet as Inactive even with a recent heartbeat', async () => {
      await Tablet.updateOne(
        { deviceCode: 'LIB-TAB-01' },
        { $set: { lastSeen: new Date(), isActive: false } },
      );

      const res = await getSummary(roles.superAdmin.token);

      expect(res.body.data.summary.inactiveCount).toBe(1);
      expect(res.body.data.summary.onlineCount).toBe(0);
    });
  });

  it('scopes tablet status counts to the caller\'s own department', async () => {
    const res = await getSummary(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.offlineCount).toBe(2);
    expect(res.body.data.summary.onlineCount + res.body.data.summary.inactiveCount).toBe(0);
  });

  it('counts feedback submitted today, scoped by department', async () => {
    const submittedAt = new Date();
    const survey = await Survey.findOne({ title: 'General Service Feedback' });
    const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });

    await FeedbackSession.create({
      referenceCode: 'FB-2026-SMOKE-TODAY',
      surveyId: survey._id,
      tabletId: tablet._id,
      locationId: tablet.locationId,
      departmentId: tablet.departmentId,
      submittedAt,
      completedAt: submittedAt,
      durationSeconds: 0,
      status: 'completed',
    });

    const adminRes = await getSummary(roles.superAdmin.token);
    expect(adminRes.body.data.summary.feedbackToday).toBe(1);

    const libraryRes = await getSummary(roles.libraryStaff.token);
    expect(libraryRes.body.data.summary.feedbackToday).toBe(0);

    await FeedbackSession.deleteOne({ referenceCode: 'FB-2026-SMOKE-TODAY' });
  });

  it('returns activeSurveysCount matching each role\'s survey visibility', async () => {
    const adminRes = await getSummary(roles.superAdmin.token);
    expect(adminRes.body.data.summary.activeSurveysCount).toBe(2); // Global + Registrar

    const registrarRes = await getSummary(roles.registrarHead.token);
    expect(registrarRes.body.data.summary.activeSurveysCount).toBe(2); // Global + own dept

    const libraryRes = await getSummary(roles.libraryStaff.token);
    expect(libraryRes.body.data.summary.activeSurveysCount).toBe(1); // Global only (Library survey is draft)
  });

  it('returns departmentsCount/locationsCount matching each role\'s organization visibility', async () => {
    const adminRes = await getSummary(roles.superAdmin.token);
    expect(adminRes.body.data.summary.departmentsCount).toBe(2);
    expect(adminRes.body.data.summary.locationsCount).toBe(4);

    const registrarRes = await getSummary(roles.registrarHead.token);
    expect(registrarRes.body.data.summary.departmentsCount).toBe(1);
    expect(registrarRes.body.data.summary.locationsCount).toBe(2);
  });
});
