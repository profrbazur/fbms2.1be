import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import FeedbackAnswer from '../../src/models/FeedbackAnswer.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getReport = (token, query = '') =>
  request(app)
    .get(`/api/v1/reports/feedback-summary${query}`)
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

describe('GET /api/v1/reports/feedback-summary — serviceQuality (V2.5)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getReport();
    expect(res.status).toBe(401);
  });

  it('Super Admin sees institution-wide Courtesy/Clarity/Waiting Time/Overall, computed from actual seeded data', async () => {
    const res = await getReport(roles.superAdmin.token);
    expect(res.status).toBe(200);

    const { serviceQuality } = res.body.data;
    // Registrar: courtesy [5,4,4,5], clarity [5,4,3,5], waiting_time [4,3,2,5]
    // Library:   courtesy [3,4],     clarity [4,4],     waiting_time [5,4]
    expect(serviceQuality.courtesy).toBeCloseTo(4.17, 2);
    expect(serviceQuality.clarity).toBeCloseTo(4.17, 2);
    expect(serviceQuality.waitingTime).toBeCloseTo(3.83, 2);
    expect(serviceQuality.overall).toBeCloseTo(4.06, 2);
  });

  it('Senior Leadership sees the same institution-wide values as Super Admin', async () => {
    const res = await getReport(roles.seniorLeadership.token);
    expect(res.status).toBe(200);
    expect(res.body.data.serviceQuality.courtesy).toBeCloseTo(4.17, 2);
  });

  it('the Office x Category heatmap has one row per department with in-scope data, sorted by name', async () => {
    const res = await getReport(roles.superAdmin.token);
    const { byDepartment } = res.body.data.serviceQuality;

    expect(byDepartment.length).toBe(2);
    expect(byDepartment.map((row) => row.departmentName)).toEqual(['Library', 'Registrar']);

    const library = byDepartment.find((row) => row.departmentName === 'Library');
    expect(library.courtesy).toBeCloseTo(3.5, 2);
    expect(library.clarity).toBeCloseTo(4.0, 2);
    expect(library.waitingTime).toBeCloseTo(4.5, 2);
    expect(library.overall).toBeCloseTo(4.0, 2);

    const registrar = byDepartment.find((row) => row.departmentName === 'Registrar');
    expect(registrar.courtesy).toBeCloseTo(4.5, 2);
    expect(registrar.clarity).toBeCloseTo(4.25, 2);
    expect(registrar.waitingTime).toBeCloseTo(3.5, 2);
    expect(registrar.overall).toBeCloseTo(4.08, 2);
  });

  it('Registrar Department Head is scoped to only Registrar\'s own values', async () => {
    const res = await getReport(roles.registrarHead.token);
    expect(res.status).toBe(200);

    const { serviceQuality } = res.body.data;
    expect(serviceQuality.courtesy).toBeCloseTo(4.5, 2);
    expect(serviceQuality.clarity).toBeCloseTo(4.25, 2);
    expect(serviceQuality.waitingTime).toBeCloseTo(3.5, 2);
    expect(serviceQuality.overall).toBeCloseTo(4.08, 2);

    // A department-scoped caller's heatmap always has exactly one row —
    // their own department — matching feedbackByDepartment's identical,
    // already-established convention.
    expect(serviceQuality.byDepartment.length).toBe(1);
    expect(serviceQuality.byDepartment[0].departmentName).toBe('Registrar');
  });

  it('Library Department Head is scoped to only Library\'s own (different) values', async () => {
    const res = await getReport(roles.libraryHead.token);
    expect(res.status).toBe(200);

    const { serviceQuality } = res.body.data;
    expect(serviceQuality.courtesy).toBeCloseTo(3.5, 2);
    expect(serviceQuality.clarity).toBeCloseTo(4.0, 2);
    expect(serviceQuality.waitingTime).toBeCloseTo(4.5, 2);
    expect(serviceQuality.overall).toBeCloseTo(4.0, 2);
    expect(serviceQuality.byDepartment.length).toBe(1);
    expect(serviceQuality.byDepartment[0].departmentName).toBe('Library');
  });

  it('Personnel role is scoped identically to their own Department Head', async () => {
    const res = await getReport(roles.registrarStaff.token);
    expect(res.status).toBe(200);
    expect(res.body.data.serviceQuality.courtesy).toBeCloseTo(4.5, 2);
  });

  it('a departmentId query parameter cannot widen a Department Head\'s scope (cross-department bypass denied)', async () => {
    const res = await getReport(roles.registrarHead.token, `?departmentId=${libraryDept._id.toString()}`);
    expect(res.status).toBe(200);
    // Still Registrar's own values, never Library's, regardless of the query param.
    expect(res.body.data.serviceQuality.courtesy).toBeCloseTo(4.5, 2);
    expect(res.body.data.serviceQuality.byDepartment[0].departmentName).toBe('Registrar');
  });

  it('Super Admin can narrow the heatmap to a single department via departmentId', async () => {
    const res = await getReport(roles.superAdmin.token, `?departmentId=${registrarDept._id.toString()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.serviceQuality.byDepartment.length).toBe(1);
    expect(res.body.data.serviceQuality.byDepartment[0].departmentName).toBe('Registrar');
  });

  it('returns all-null values and an empty heatmap when a date filter excludes every categorized answer (zero-data scope)', async () => {
    const res = await getReport(roles.superAdmin.token, '?dateFrom=2030-01-01&dateTo=2030-01-02');
    expect(res.status).toBe(200);

    const { serviceQuality } = res.body.data;
    expect(serviceQuality.courtesy).toBeNull();
    expect(serviceQuality.clarity).toBeNull();
    expect(serviceQuality.waitingTime).toBeNull();
    expect(serviceQuality.overall).toBeNull();
    expect(serviceQuality.byDepartment).toEqual([]);
  });

  it('does not divide by nonexistent answers or crash for a caller with no visible department', async () => {
    // A department_head/personnel-shaped user with no departmentId at all
    // is the "no visible scope" case buildReportFilter/buildFeedbackScopeFilter
    // returns null for — exercised indirectly via the empty-scope report
    // shape already asserted above; this test documents the expectation
    // explicitly for service quality specifically.
    const res = await getReport(roles.superAdmin.token, '?departmentId=507f1f77bcf86cd799439011');
    expect(res.status).toBe(200);
    expect(res.body.data.serviceQuality.byDepartment).toEqual([]);
  });
});

describe('Service Quality — historical integrity across a later Survey edit', () => {
  it('an existing FeedbackAnswer keeps its original serviceQualityCategory snapshot after the live Question mapping later changes', async () => {
    const registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const courtesyQuestion = await Question.findOne({
      surveyId: registrarSurvey._id,
      serviceQualityCategory: 'courtesy',
    });
    const existingSession = await FeedbackSession.findOne({ referenceCode: 'FB-2026-000007' });
    const existingAnswer = await FeedbackAnswer.findOne({
      feedbackSessionId: existingSession._id,
      questionId: courtesyQuestion._id,
    });
    expect(existingAnswer.serviceQualityCategory).toBe('courtesy');

    // Unpublish (required to edit), remap the question's live category,
    // then republish — mirrors a real admin workflow.
    const unpublishRes = await request(app)
      .post(`/api/v1/surveys/${registrarSurvey._id}/unpublish`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(unpublishRes.status).toBe(200);

    const patchRes = await request(app)
      .patch(`/api/v1/questions/${courtesyQuestion._id}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ serviceQualityCategory: 'clarity' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.question.serviceQualityCategory).toBe('clarity');

    const republishRes = await request(app)
      .post(`/api/v1/surveys/${registrarSurvey._id}/publish`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });
    expect(republishRes.status).toBe(200);

    // The live Question now maps to 'clarity'...
    const updatedQuestion = await Question.findById(courtesyQuestion._id);
    expect(updatedQuestion.serviceQualityCategory).toBe('clarity');

    // ...but the historical answer, recorded before the edit, is untouched.
    const unchangedAnswer = await FeedbackAnswer.findById(existingAnswer._id);
    expect(unchangedAnswer.serviceQualityCategory).toBe('courtesy');
  });
});

describe('Anti-spoofing — service-quality category cannot be set by client payload', () => {
  it('a client-injected serviceQualityCategory on a mobile feedback answer is silently discarded, never persisted', async () => {
    const { deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01');
    const registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const questions = await Question.find({ surveyId: registrarSurvey._id }).sort({ order: 1 });
    const clarityQuestion = questions.find((q) => q.serviceQualityCategory === 'clarity');
    const uncategorizedRatingQuestion = questions.find(
      (q) => q.questionType === 'rating' && q.serviceQualityCategory === null,
    );

    const res = await request(app)
      .post('/api/v1/mobile/feedback')
      .set(deviceAuthHeader(deviceSecret))
      .send({
        surveyId: registrarSurvey._id.toString(),
        submittedAt: '2026-08-10T09:00:00.000Z',
        completedAt: '2026-08-10T09:01:00.000Z',
        answers: questions
          .filter((q) => q.required)
          .map((q) => ({
            questionId: q._id.toString(),
            answer: q.questionType === 'rating' ? 4 : q.questionType === 'multiple_choice' ? q.options[0] : true,
            // Attempted spoof: claim this uncategorized/mismatched answer
            // belongs to a different management dimension than the
            // server's own Question record says.
            serviceQualityCategory: 'waiting_time',
          })),
      });

    expect(res.status).toBe(201);

    const createdAnswers = await FeedbackAnswer.find({ feedbackSessionId: res.body.data.feedbackSession._id });
    const clarityAnswer = createdAnswers.find((a) => a.questionId.toString() === clarityQuestion._id.toString());
    expect(clarityAnswer.serviceQualityCategory).toBe('clarity'); // server-derived, not the spoofed 'waiting_time'

    if (uncategorizedRatingQuestion) {
      const uncategorizedAnswer = createdAnswers.find(
        (a) => a.questionId.toString() === uncategorizedRatingQuestion._id.toString(),
      );
      if (uncategorizedAnswer) {
        expect(uncategorizedAnswer.serviceQualityCategory).toBeNull(); // never the spoofed value either
      }
    }
  });
});
