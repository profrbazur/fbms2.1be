import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Location from '../../src/models/Location.js';
import Survey from '../../src/models/Survey.js';
import Tablet from '../../src/models/Tablet.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getReport = (token, query = '') =>
  request(app)
    .get(`/api/v1/reports/feedback-summary${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;
let registrarDept;
let libraryDept;
let regLoc01;
let regLoc02;
let generalSurvey;
let registrarSurvey;
let regTab01;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
  regLoc01 = await Location.findOne({ code: 'REG-LOC-01' });
  regLoc02 = await Location.findOne({ code: 'REG-LOC-02' });
  generalSurvey = await Survey.findOne({ title: 'General Service Feedback' });
  registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
  regTab01 = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/reports/feedback-summary', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getReport();
    expect(res.status).toBe(401);
  });

  it('is available to all three roles', async () => {
    for (const role of [roles.superAdmin, roles.registrarHead, roles.libraryStaff]) {
      const res = await getReport(role.token);
      expect(res.status).toBe(200);
    }
  });

  it('returns no write-related fields and no POST/PATCH/DELETE endpoint exists', async () => {
    const getRes = await getReport(roles.superAdmin.token);
    expect(getRes.status).toBe(200);

    const postRes = await request(app)
      .post('/api/v1/reports/feedback-summary')
      .set('Authorization', `Bearer ${roles.superAdmin.token}`);
    expect(postRes.status).toBe(404);

    const patchRes = await request(app)
      .patch('/api/v1/reports/feedback-summary')
      .set('Authorization', `Bearer ${roles.superAdmin.token}`);
    expect(patchRes.status).toBe(404);
  });

  describe('summary — Super Admin (system-wide)', () => {
    it('returns exact seeded totals', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { summary } = res.body.data;

      expect(summary.totalFeedback).toBe(10);
      expect(summary.averageRating).toBeCloseTo(3.7, 2);
      expect(summary.activeSurveysCount).toBe(2);
      expect(summary.activeTabletsCount).toBe(4);
      expect(summary.departmentsRepresented).toBe(2);
    });

    it('feedbackToday/thisWeek/thisMonth match independently-computed ground truth', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { summary } = res.body.data;

      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
      const startOfMonth = new Date(Date.UTC(startOfToday.getUTCFullYear(), startOfToday.getUTCMonth(), 1));

      const [expectedToday, expectedWeek, expectedMonth] = await Promise.all([
        FeedbackSession.countDocuments({ submittedAt: { $gte: startOfToday } }),
        FeedbackSession.countDocuments({ submittedAt: { $gte: startOfWeek } }),
        FeedbackSession.countDocuments({ submittedAt: { $gte: startOfMonth } }),
      ]);

      expect(summary.feedbackToday).toBe(expectedToday);
      expect(summary.feedbackThisWeek).toBe(expectedWeek);
      expect(summary.feedbackThisMonth).toBe(expectedMonth);
    });

    it('a session submitted right now appears in feedbackToday regardless of any dateFrom/dateTo filter applied elsewhere', async () => {
      const submittedAt = new Date();
      await FeedbackSession.create({
        referenceCode: 'FB-2026-REPORT-TODAY',
        surveyId: generalSurvey._id,
        tabletId: regTab01._id,
        locationId: regTab01.locationId,
        departmentId: regTab01.departmentId,
        submittedAt,
        completedAt: submittedAt,
        durationSeconds: 0,
        status: 'completed',
      });

      const res = await getReport(roles.superAdmin.token, '?dateFrom=2020-01-01&dateTo=2020-01-02');
      expect(res.body.data.summary.feedbackToday).toBeGreaterThanOrEqual(1);

      await FeedbackSession.deleteOne({ referenceCode: 'FB-2026-REPORT-TODAY' });
    });
  });

  describe('summary — department scoping', () => {
    it('Registrar Department Head sees only Registrar totals', async () => {
      const res = await getReport(roles.registrarHead.token);
      const { summary } = res.body.data;

      expect(summary.totalFeedback).toBe(8);
      expect(summary.averageRating).toBeCloseTo(3.625, 2);
      expect(summary.activeTabletsCount).toBe(2);
      expect(summary.departmentsRepresented).toBe(1);
    });

    it('Library Personnel sees only Library totals', async () => {
      const res = await getReport(roles.libraryStaff.token);
      const { summary } = res.body.data;

      expect(summary.totalFeedback).toBe(2);
      expect(summary.averageRating).toBeCloseTo(4, 2);
      expect(summary.activeTabletsCount).toBe(2);
      expect(summary.departmentsRepresented).toBe(1);
    });

    it('a client-supplied departmentId cannot widen a scoped role\'s data', async () => {
      const res = await getReport(roles.registrarHead.token, `?departmentId=${libraryDept._id.toString()}`);
      expect(res.body.data.summary.totalFeedback).toBe(8);
      expect(res.body.data.filters.departmentId).toBe(registrarDept._id.toString());
    });

    it('Super Admin can narrow by departmentId and receives that department\'s totals only', async () => {
      const res = await getReport(roles.superAdmin.token, `?departmentId=${libraryDept._id.toString()}`);
      expect(res.body.data.summary.totalFeedback).toBe(2);
      expect(res.body.data.filters.departmentId).toBe(libraryDept._id.toString());
    });
  });

  describe('input validation', () => {
    it('rejects an invalid departmentId safely (400, not 500)', async () => {
      const res = await getReport(roles.superAdmin.token, '?departmentId=not-a-valid-id');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid locationId safely (400, not 500)', async () => {
      const res = await getReport(roles.superAdmin.token, '?locationId=not-a-valid-id');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid surveyId safely (400, not 500)', async () => {
      const res = await getReport(roles.superAdmin.token, '?surveyId=not-a-valid-id');
      expect(res.status).toBe(400);
    });

    it('rejects an unparseable dateFrom', async () => {
      const res = await getReport(roles.superAdmin.token, '?dateFrom=not-a-date');
      expect(res.status).toBe(400);
    });

    it('rejects dateFrom after dateTo', async () => {
      const res = await getReport(roles.superAdmin.token, '?dateFrom=2026-08-05&dateTo=2026-08-01');
      expect(res.status).toBe(400);
    });
  });

  describe('date filtering', () => {
    it('dateFrom narrows totalFeedback to sessions on/after that date', async () => {
      const res = await getReport(roles.superAdmin.token, '?dateFrom=2026-08-01');
      expect(res.body.data.summary.totalFeedback).toBe(3); // sessions 8, 9, 10
    });

    it('dateTo narrows totalFeedback to sessions at/before that instant', async () => {
      // dateTo is parsed as a literal timestamp (2026-07-21T00:00:00.000Z),
      // not "end of day" — matching feedbackService's existing dateTo
      // convention, so session 1 (07-20T09:15) is included and session 2
      // (07-22T13:05) is not.
      const res = await getReport(roles.superAdmin.token, '?dateTo=2026-07-21');
      expect(res.body.data.summary.totalFeedback).toBe(1); // session 1 only
    });

    it('an empty date window returns zero rows and null averageRating, not an error', async () => {
      const res = await getReport(roles.superAdmin.token, '?dateFrom=2020-01-01&dateTo=2020-01-02');
      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalFeedback).toBe(0);
      expect(res.body.data.summary.averageRating).toBeNull();
      expect(res.body.data.ratingDistribution).toEqual([
        { rating: 1, count: 0, percentage: 0 },
        { rating: 2, count: 0, percentage: 0 },
        { rating: 3, count: 0, percentage: 0 },
        { rating: 4, count: 0, percentage: 0 },
        { rating: 5, count: 0, percentage: 0 },
      ]);
      expect(res.body.data.feedbackByDepartment).toEqual([]);
      expect(res.body.data.feedbackBySurvey).toEqual([]);
      expect(res.body.data.feedbackByLocation).toEqual([]);
    });
  });

  describe('location filtering', () => {
    it('locationId narrows totalFeedback to that location\'s sessions', async () => {
      const res = await getReport(roles.superAdmin.token, `?locationId=${regLoc01._id.toString()}`);
      expect(res.body.data.summary.totalFeedback).toBe(5); // sessions 1, 2, 6, 7, 9
    });
  });

  describe('survey filtering', () => {
    it('surveyId narrows totalFeedback to that survey\'s sessions', async () => {
      const res = await getReport(roles.superAdmin.token, `?surveyId=${registrarSurvey._id.toString()}`);
      expect(res.body.data.summary.totalFeedback).toBe(4); // sessions 7, 8, 9, 10
    });
  });

  describe('feedback trend', () => {
    it('defaults to 7 days with zero-filled gaps', async () => {
      const res = await getReport(roles.superAdmin.token);
      expect(res.body.data.feedbackTrend).toHaveLength(7);
      res.body.data.feedbackTrend.forEach((point) => {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('count');
      });
    });

    it('supports ?trendDays=30', async () => {
      const res = await getReport(roles.superAdmin.token, '?trendDays=30');
      expect(res.body.data.feedbackTrend).toHaveLength(30);
    });

    it('an invalid trendDays value falls back to 7 rather than erroring', async () => {
      const res = await getReport(roles.superAdmin.token, '?trendDays=999');
      expect(res.status).toBe(200);
      expect(res.body.data.feedbackTrend).toHaveLength(7);
    });

    it('supports a custom dateFrom/dateTo range, inclusive and zero-filled', async () => {
      const res = await getReport(roles.superAdmin.token, '?dateFrom=2026-07-20&dateTo=2026-07-24');
      expect(res.body.data.feedbackTrend).toHaveLength(5);
      expect(res.body.data.feedbackTrend[0].date).toBe('2026-07-20');
      expect(res.body.data.feedbackTrend[4].date).toBe('2026-07-24');
      const total = res.body.data.feedbackTrend.reduce((sum, p) => sum + p.count, 0);
      expect(total).toBe(3); // sessions 1, 2, 3
    });
  });

  describe('rating distribution', () => {
    it('returns exact counts and percentages for Super Admin (system-wide)', async () => {
      const res = await getReport(roles.superAdmin.token);
      expect(res.body.data.ratingDistribution).toEqual([
        { rating: 1, count: 1, percentage: 10 },
        { rating: 2, count: 1, percentage: 10 },
        { rating: 3, count: 2, percentage: 20 },
        { rating: 4, count: 2, percentage: 20 },
        { rating: 5, count: 4, percentage: 40 },
      ]);
    });

    it('is department-scoped for a Department Head', async () => {
      const res = await getReport(roles.registrarHead.token);
      const total = res.body.data.ratingDistribution.reduce((sum, r) => sum + r.count, 0);
      expect(total).toBe(8);
    });

    it('never infers a rating from a non-rating answer', async () => {
      const res = await getReport(roles.superAdmin.token);
      const total = res.body.data.ratingDistribution.reduce((sum, r) => sum + r.count, 0);
      expect(total).toBe(10); // exactly one rating answer per seeded session, never more
    });
  });

  describe('feedback by department', () => {
    it('returns both departments for Super Admin with count and averageRating, summing to totalFeedback', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { feedbackByDepartment, summary } = res.body.data;

      expect(feedbackByDepartment).toHaveLength(2);
      const total = feedbackByDepartment.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(summary.totalFeedback);

      const registrarRow = feedbackByDepartment.find((r) => r.departmentId === registrarDept._id.toString());
      const libraryRow = feedbackByDepartment.find((r) => r.departmentId === libraryDept._id.toString());
      expect(registrarRow).toMatchObject({ departmentName: 'Registrar', count: 8 });
      expect(registrarRow.averageRating).toBeCloseTo(3.625, 2);
      expect(libraryRow).toMatchObject({ departmentName: 'Library', count: 2 });
      expect(libraryRow.averageRating).toBeCloseTo(4, 2);
    });

    it('returns only one row for a department-scoped role (Super Admin only receives cross-department comparison)', async () => {
      const res = await getReport(roles.registrarHead.token);
      expect(res.body.data.feedbackByDepartment).toHaveLength(1);
      expect(res.body.data.feedbackByDepartment[0].count).toBe(8);
    });
  });

  describe('feedback by survey', () => {
    it('returns counts, titles, and averageRating for Super Admin', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { feedbackBySurvey } = res.body.data;

      const generalRow = feedbackBySurvey.find((r) => r.surveyTitle === 'General Service Feedback');
      const registrarRow = feedbackBySurvey.find((r) => r.surveyTitle === 'Registrar Office Feedback');
      expect(generalRow.count).toBe(6);
      expect(generalRow.averageRating).toBeCloseTo(20 / 6, 2);
      expect(registrarRow.count).toBe(4);
      expect(registrarRow.averageRating).toBeCloseTo(4.25, 2);
    });

    it('a Global survey appears for a department that collected feedback against it', async () => {
      const res = await getReport(roles.libraryStaff.token);
      const generalRow = res.body.data.feedbackBySurvey.find((r) => r.surveyTitle === 'General Service Feedback');
      expect(generalRow).toBeTruthy();
      expect(generalRow.count).toBe(2);
    });
  });

  describe('feedback by location', () => {
    it('returns location, department, count, and averageRating for Super Admin', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { feedbackByLocation } = res.body.data;

      const loc01Row = feedbackByLocation.find((r) => r.locationId === regLoc01._id.toString());
      expect(loc01Row).toMatchObject({
        locationName: 'Registrar Main Counter',
        departmentId: registrarDept._id.toString(),
        departmentName: 'Registrar',
        count: 5,
      });
      expect(loc01Row.averageRating).toBeCloseTo(3.6, 2);

      const total = feedbackByLocation.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(res.body.data.summary.totalFeedback);
    });

    it('is scoped to a Department Head\'s own department\'s locations only', async () => {
      const res = await getReport(roles.registrarHead.token);
      res.body.data.feedbackByLocation.forEach((row) => {
        expect(row.departmentId).toBe(registrarDept._id.toString());
      });
    });
  });

  describe('survey performance', () => {
    it('includes every visible survey for Super Admin, including a zero-feedback draft survey', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { surveyPerformance } = res.body.data;

      expect(surveyPerformance).toHaveLength(3);

      const general = surveyPerformance.find((s) => s.title === 'General Service Feedback');
      expect(general).toMatchObject({ assignmentType: 'Global', isPublished: true, feedbackCount: 6 });

      const registrar = surveyPerformance.find((s) => s.title === 'Registrar Office Feedback');
      expect(registrar).toMatchObject({ assignmentType: 'Department', isPublished: true, feedbackCount: 4 });

      const library = surveyPerformance.find((s) => s.title === 'Library Services Feedback');
      expect(library).toMatchObject({ assignmentType: 'Department', isPublished: false, feedbackCount: 0 });
      expect(library.averageRating).toBeNull();
    });

    it('respects department visibility for a Department Head (Global + own department only)', async () => {
      const res = await getReport(roles.libraryStaff.token);
      const titles = res.body.data.surveyPerformance.map((s) => s.title);

      expect(titles).toContain('General Service Feedback');
      expect(titles).toContain('Library Services Feedback');
      expect(titles).not.toContain('Registrar Office Feedback');
    });

    it('narrows to a single survey via surveyId', async () => {
      const res = await getReport(roles.superAdmin.token, `?surveyId=${registrarSurvey._id.toString()}`);
      expect(res.body.data.surveyPerformance).toHaveLength(1);
      expect(res.body.data.surveyPerformance[0].surveyId).toBe(registrarSurvey._id.toString());
    });
  });

  describe('tablet contribution', () => {
    it('includes every visible tablet with feedbackCount and lastFeedbackAt for Super Admin', async () => {
      const res = await getReport(roles.superAdmin.token);
      const { tabletContribution } = res.body.data;

      expect(tabletContribution).toHaveLength(4);

      const tab01Row = tabletContribution.find((t) => t.tabletId === regTab01._id.toString());
      expect(tab01Row).toMatchObject({
        deviceName: 'Registrar Main Counter Kiosk',
        departmentName: 'Registrar',
        locationName: 'Registrar Main Counter',
        feedbackCount: 5,
      });
      expect(new Date(tab01Row.lastFeedbackAt).toISOString()).toBe(new Date('2026-08-03T10:10:00.000Z').toISOString());
    });

    it('never exposes activationToken or deviceSecretHash', async () => {
      const res = await getReport(roles.superAdmin.token);
      const serialized = JSON.stringify(res.body.data.tabletContribution);
      expect(serialized).not.toMatch(/activationToken/i);
      expect(serialized).not.toMatch(/deviceSecretHash/i);
    });

    it('is scoped to a Department Head\'s own department\'s tablets only', async () => {
      const res = await getReport(roles.registrarHead.token);
      expect(res.body.data.tabletContribution).toHaveLength(2);
      res.body.data.tabletContribution.forEach((t) => {
        expect(t.departmentId).toBe(registrarDept._id.toString());
      });
    });

    it('a tablet with no feedback yet still appears with feedbackCount 0 and lastFeedbackAt null', async () => {
      const res = await getReport(roles.superAdmin.token, `?dateFrom=2020-01-01&dateTo=2020-01-02`);
      const { tabletContribution } = res.body.data;
      expect(tabletContribution.length).toBeGreaterThan(0);
      tabletContribution.forEach((t) => {
        expect(t.feedbackCount).toBe(0);
        expect(t.lastFeedbackAt).toBeNull();
      });
    });
  });

  describe('filters echo', () => {
    it('echoes the resolved filters actually applied', async () => {
      const res = await getReport(
        roles.superAdmin.token,
        `?locationId=${regLoc02._id.toString()}&dateFrom=2026-08-01`,
      );
      expect(res.body.data.filters).toMatchObject({
        locationId: regLoc02._id.toString(),
        dateFrom: '2026-08-01',
        departmentId: null,
        surveyId: null,
      });
    });
  });
});
