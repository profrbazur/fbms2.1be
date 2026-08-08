import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import FeedbackAnswer from '../../src/models/FeedbackAnswer.js';
import AuditLog from '../../src/models/AuditLog.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const reload = (token) =>
  request(app)
    .post('/api/v1/developer-portal/reload-canonical-dataset')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
}, 30000);

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/developer-portal/reload-canonical-dataset', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await reload(undefined);
    expect(res.status).toBe(401);
  });

  it('rejects a Department Head with 403', async () => {
    const res = await reload(roles.registrarHead.token);
    expect(res.status).toBe(403);
  });

  it('rejects Personnel with 403', async () => {
    const res = await reload(roles.registrarStaff.token);
    expect(res.status).toBe(403);
  });

  it(
    'restores the canonical baseline for Super Admin, removing extraneous sessions, and records an audit event',
    async () => {
      // Simulate a real mobile submission made after the canonical dataset
      // was previously loaded — outside the protected FB-2026-000001..
      // 003010 range, so "Reload" should remove it.
      const anySession = await FeedbackSession.findOne();
      const extraneous = await FeedbackSession.create({
        referenceCode: 'FB-2026-005000',
        surveyId: anySession.surveyId,
        tabletId: anySession.tabletId,
        locationId: anySession.locationId,
        departmentId: anySession.departmentId,
        submittedAt: new Date(),
        completedAt: new Date(),
        durationSeconds: 60,
        status: 'completed',
      });
      await FeedbackAnswer.create({
        feedbackSessionId: extraneous._id,
        questionId: extraneous._id, // arbitrary — only existence/cleanup is being asserted
        questionType: 'rating',
        answer: 5,
      });

      const beforeAuditCount = await AuditLog.countDocuments({
        action: 'developerPortal.reload_canonical_dataset',
      });

      const res = await reload(roles.superAdmin.token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deletedSessions).toBeGreaterThanOrEqual(1);
      expect(res.body.data.restoredSessions).toBe(3000);
      expect(res.body.data.restoredAnswers).toBeGreaterThan(0);

      const stillExists = await FeedbackSession.findOne({ referenceCode: 'FB-2026-005000' });
      expect(stillExists).toBeNull();

      const orphanedAnswer = await FeedbackAnswer.findOne({ feedbackSessionId: extraneous._id });
      expect(orphanedAnswer).toBeNull();

      const totalSessions = await FeedbackSession.countDocuments();
      expect(totalSessions).toBe(3010); // 10 base (feedbackSeeder) + 3000 canonical

      const auditCount = await AuditLog.countDocuments({
        action: 'developerPortal.reload_canonical_dataset',
      });
      expect(auditCount).toBe(beforeAuditCount + 1);

      const auditEntry = await AuditLog.findOne({
        action: 'developerPortal.reload_canonical_dataset',
      }).sort({ createdAt: -1 });
      expect(auditEntry.actorEmail).toBe('superadmin@fbms.test');
      expect(auditEntry.entityType).toBe('developerPortal');
      expect(auditEntry.outcome).toBe('success');
    },
    60000,
  );

  it('is idempotent — reloading again does not duplicate or error', async () => {
    const res = await reload(roles.superAdmin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.deletedSessions).toBe(0);

    const totalSessions = await FeedbackSession.countDocuments();
    expect(totalSessions).toBe(3010);
  }, 60000);
});
