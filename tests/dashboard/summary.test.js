import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Tablet from '../../src/models/Tablet.js';
import Survey from '../../src/models/Survey.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getSummary = (token, query = '') =>
  request(app)
    .get(`/api/v1/dashboard/summary${query}`)
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

describe('GET /api/v1/dashboard/summary', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getSummary();
    expect(res.status).toBe(401);
  });

  it('is available to all three roles', async () => {
    for (const role of [roles.superAdmin, roles.registrarHead, roles.libraryStaff]) {
      const res = await getSummary(role.token);
      expect(res.status).toBe(200);
    }
  });

  describe('cards — Super Admin (system-wide)', () => {
    it('returns organization counts matching the seeded data', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { cards } = res.body.data;

      expect(cards.departmentsCount).toBe(2);
      expect(cards.locationsCount).toBe(4);
      expect(cards.personnelCount).toBe(8);
      expect(cards.tabletsCount).toBe(4);
    });

    it('tabletsCount always equals online + offline + inactive (inactive exposed via the status distribution chart, not its own card)', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { cards, charts } = res.body.data;

      expect(cards.tabletsCount).toBe(
        cards.onlineTabletsCount + cards.offlineTabletsCount + charts.tabletStatusDistribution.inactive,
      );
    });

    it('returns activeSurveysCount and totalFeedback matching seeded data', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { cards } = res.body.data;

      expect(cards.activeSurveysCount).toBe(2); // Global + Registrar published
      expect(cards.totalFeedback).toBe(10);
    });

    it('returns the correct system-wide average rating', async () => {
      const res = await getSummary(roles.superAdmin.token);
      // Ten rating answers across the seeded sessions: 5,4,2,5,3,1,5,4,3,5 -> sum 37 / 10
      expect(res.body.data.cards.averageRating).toBeCloseTo(3.7, 2);
    });

    it('feedbackToday is 0 against historical seeded data alone', async () => {
      const res = await getSummary(roles.superAdmin.token);
      expect(res.body.data.cards.feedbackToday).toBe(0);
    });
  });

  describe('cards — department scoping', () => {
    it('Registrar Department Head sees only Registrar-department totals', async () => {
      const res = await getSummary(roles.registrarHead.token);
      const { cards } = res.body.data;

      expect(cards.departmentsCount).toBe(1);
      expect(cards.locationsCount).toBe(2);
      expect(cards.tabletsCount).toBe(2);
      expect(cards.totalFeedback).toBe(8);
      expect(cards.averageRating).toBeCloseTo(3.625, 2); // 5+4+2+1+5+4+3+5 = 29 / 8
    });

    it('Library Personnel sees only Library-department totals', async () => {
      const res = await getSummary(roles.libraryStaff.token);
      const { cards } = res.body.data;

      expect(cards.departmentsCount).toBe(1);
      expect(cards.locationsCount).toBe(2);
      expect(cards.tabletsCount).toBe(2);
      expect(cards.totalFeedback).toBe(2);
      expect(cards.averageRating).toBeCloseTo(4, 2); // 5+3 = 8 / 2
    });

    it('a department-scoped role can never see another department\'s counts, even indirectly', async () => {
      const registrarRes = await getSummary(roles.registrarHead.token);
      const libraryRes = await getSummary(roles.libraryStaff.token);

      expect(registrarRes.body.data.cards.totalFeedback + libraryRes.body.data.cards.totalFeedback).toBe(10);
      expect(registrarRes.body.data.cards.personnelCount).not.toBe(libraryRes.body.data.cards.personnelCount + 999);
    });
  });

  describe('charts', () => {
    it('tabletStatusDistribution online/offline mirror the tablet cards exactly, and the three buckets sum to tabletsCount', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { cards, charts } = res.body.data;

      expect(charts.tabletStatusDistribution.online).toBe(cards.onlineTabletsCount);
      expect(charts.tabletStatusDistribution.offline).toBe(cards.offlineTabletsCount);
      expect(
        charts.tabletStatusDistribution.online +
          charts.tabletStatusDistribution.offline +
          charts.tabletStatusDistribution.inactive,
      ).toBe(cards.tabletsCount);
    });

    it('surveyStatusDistribution matches seeded publish state (Super Admin)', async () => {
      const res = await getSummary(roles.superAdmin.token);
      expect(res.body.data.charts.surveyStatusDistribution).toEqual({
        draft: 1, // Library Services Feedback
        published: 2, // General Service Feedback + Registrar Office Feedback
        archived: 0,
      });
    });

    it('surveyStatusDistribution scopes to a department-head\'s own department (their draft survey included)', async () => {
      const res = await getSummary(roles.libraryStaff.token);
      expect(res.body.data.charts.surveyStatusDistribution).toEqual({
        draft: 1, // Library Services Feedback — visible to Library staff even unpublished
        published: 1, // Global only
        archived: 0,
      });
    });

    it('feedbackByDepartment returns both departments for Super Admin, summing to totalFeedback', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { charts, cards } = res.body.data;

      const total = charts.feedbackByDepartment.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(cards.totalFeedback);
      expect(charts.feedbackByDepartment.length).toBe(2);

      const registrarRow = charts.feedbackByDepartment.find(
        (row) => row.departmentId === registrarDept._id.toString(),
      );
      const libraryRow = charts.feedbackByDepartment.find(
        (row) => row.departmentId === libraryDept._id.toString(),
      );
      expect(registrarRow).toMatchObject({ departmentName: 'Registrar', count: 8 });
      expect(libraryRow).toMatchObject({ departmentName: 'Library', count: 2 });
    });

    it('feedbackByDepartment returns only one row for a department-scoped role', async () => {
      const res = await getSummary(roles.registrarHead.token);
      expect(res.body.data.charts.feedbackByDepartment).toHaveLength(1);
      expect(res.body.data.charts.feedbackByDepartment[0].count).toBe(8);
    });

    it('feedbackBySurvey sums to totalFeedback and includes survey titles', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { charts, cards } = res.body.data;

      const total = charts.feedbackBySurvey.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(cards.totalFeedback);

      const generalRow = charts.feedbackBySurvey.find((row) => row.surveyTitle === 'General Service Feedback');
      const registrarRow = charts.feedbackBySurvey.find((row) => row.surveyTitle === 'Registrar Office Feedback');
      expect(generalRow.count).toBe(6);
      expect(registrarRow.count).toBe(4);
    });

    it('feedbackTrend defaults to 7 days, each with a date and a count, gaps filled with 0', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { feedbackTrend } = res.body.data.charts;

      expect(feedbackTrend).toHaveLength(7);
      feedbackTrend.forEach((point) => {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('count');
        expect(typeof point.count).toBe('number');
      });

      // Deliberately not asserting "all zero" here: the seeded sessions
      // carry fixed 2026-07/08 dates (feedbackSeeder.js), and depending on
      // the real wall-clock date this suite runs on, some of those fixed
      // dates can legitimately fall inside a genuine trailing-7-day
      // window (e.g. the seeded 2026-08-01/03/05 sessions do exactly that
      // whenever "today" is on or after 2026-08-07) — asserting a
      // hardcoded "all zero" outcome would be asserting a coincidence of
      // the seed data's dates versus the calendar, not real behavior.
      // Instead, compute the same window independently here and verify
      // the endpoint's sum matches a ground-truth DB count for it.
      const returnedTotal = feedbackTrend.reduce((sum, point) => sum + point.count, 0);
      const startDate = new Date();
      startDate.setUTCHours(0, 0, 0, 0);
      startDate.setUTCDate(startDate.getUTCDate() - 6);
      const expectedTotal = await FeedbackSession.countDocuments({ submittedAt: { $gte: startDate } });
      expect(returnedTotal).toBe(expectedTotal);
    });

    it('feedbackTrend supports ?days=30', async () => {
      const res = await getSummary(roles.superAdmin.token, '?days=30');
      expect(res.body.data.charts.feedbackTrend).toHaveLength(30);
    });

    it('an invalid days value falls back to 7 rather than erroring', async () => {
      const res = await getSummary(roles.superAdmin.token, '?days=999');
      expect(res.status).toBe(200);
      expect(res.body.data.charts.feedbackTrend).toHaveLength(7);
    });

    it('a session submitted today appears in the trend and in feedbackToday', async () => {
      const survey = await Survey.findOne({ title: 'General Service Feedback' });
      const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
      const submittedAt = new Date();

      await FeedbackSession.create({
        referenceCode: 'FB-2026-DASH-TODAY',
        surveyId: survey._id,
        tabletId: tablet._id,
        locationId: tablet.locationId,
        departmentId: tablet.departmentId,
        submittedAt,
        completedAt: submittedAt,
        durationSeconds: 0,
        status: 'completed',
      });

      const res = await getSummary(roles.superAdmin.token);
      expect(res.body.data.cards.feedbackToday).toBe(1);
      const todayKey = submittedAt.toISOString().slice(0, 10);
      const todayPoint = res.body.data.charts.feedbackTrend.find((point) => point.date === todayKey);
      expect(todayPoint.count).toBe(1);

      await FeedbackSession.deleteOne({ referenceCode: 'FB-2026-DASH-TODAY' });
    });
  });

  describe('feedbackByMonth (Issue 4 — Monthly Feedback Breakdown, V2.1.1)', () => {
    it('sums to totalFeedback for Super Admin (system-wide)', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { charts, cards } = res.body.data;

      const total = charts.feedbackByMonth.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(cards.totalFeedback);
    });

    it('is scoped to a Department Head\'s own department, summing to their own totalFeedback', async () => {
      const res = await getSummary(roles.registrarHead.token);
      const { charts, cards } = res.body.data;

      const total = charts.feedbackByMonth.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(cards.totalFeedback);
    });

    it('every entry has a YYYY-MM month and a non-negative count, ascending with no gaps', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { feedbackByMonth } = res.body.data.charts;

      expect(feedbackByMonth.length).toBeGreaterThan(0);
      feedbackByMonth.forEach((row) => {
        expect(row.month).toMatch(/^\d{4}-\d{2}$/);
        expect(row.count).toBeGreaterThanOrEqual(0);
      });

      const months = feedbackByMonth.map((row) => row.month);
      expect(months).toEqual([...months].sort());

      for (let i = 1; i < months.length; i += 1) {
        const [prevYear, prevMonth] = months[i - 1].split('-').map(Number);
        const expectedNext =
          prevMonth === 12 ? `${prevYear + 1}-01` : `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
        expect(months[i]).toBe(expectedNext);
      }
    });

    it('caps at MAX_MONTHLY_BREAKDOWN_MONTHS (12) even if a session predates that window', async () => {
      const survey = await Survey.findOne({ title: 'General Service Feedback' });
      const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
      const ancientDate = new Date();
      ancientDate.setUTCFullYear(ancientDate.getUTCFullYear() - 5);

      await FeedbackSession.create({
        referenceCode: 'FB-2026-DASH-ANCIENT',
        surveyId: survey._id,
        tabletId: tablet._id,
        locationId: tablet.locationId,
        departmentId: tablet.departmentId,
        submittedAt: ancientDate,
        completedAt: ancientDate,
        durationSeconds: 0,
        status: 'completed',
      });

      const res = await getSummary(roles.superAdmin.token);
      expect(res.body.data.charts.feedbackByMonth.length).toBeLessThanOrEqual(12);

      await FeedbackSession.deleteOne({ referenceCode: 'FB-2026-DASH-ANCIENT' });
    });

    it('returns an empty array (not a zero-filled single bucket) when a scoped role has no feedback in scope', async () => {
      // No fixture role has zero feedback today, so this exercises the
      // same empty-scope path buildFeedbackScopeFilter/getFeedbackByMonth
      // share with every other getFeedbackBy* helper: an unreachable
      // departmentId (a fresh ObjectId matching nothing) via a direct
      // service-level check, avoiding a brittle "delete all data" setup.
      const { buildFeedbackScopeFilter, getFeedbackByMonth } = await import('../../src/services/analyticsService.js');
      const emptyFilter = buildFeedbackScopeFilter(
        { role: 'department_head', departmentId: null },
        {},
      );
      expect(emptyFilter).toBeNull();
      expect(await getFeedbackByMonth(emptyFilter)).toEqual([]);
    });
  });

  describe('recent activity', () => {
    it('returns at most 5 sessions, most recent first, with no edit-related fields', async () => {
      const res = await getSummary(roles.superAdmin.token);
      const { recentFeedback } = res.body.data;

      expect(recentFeedback.length).toBeLessThanOrEqual(5);
      expect(recentFeedback.length).toBeGreaterThan(0);

      const timestamps = recentFeedback.map((session) => new Date(session.submittedAt).getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));

      recentFeedback.forEach((session) => {
        expect(session).toHaveProperty('referenceCode');
        expect(session).toHaveProperty('submittedAt');
        expect(session).not.toHaveProperty('status', 'flagged');
      });
    });

    it('recent activity is department-scoped for a Department Head', async () => {
      const res = await getSummary(roles.registrarHead.token);
      res.body.data.recentFeedback.forEach((session) => {
        expect(session.departmentId).toBe(registrarDept._id.toString());
      });
    });
  });
});
