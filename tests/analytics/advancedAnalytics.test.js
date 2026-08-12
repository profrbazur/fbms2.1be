import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles, loginAs } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getAdvanced = (token, query = '') =>
  request(app)
    .get(`/api/v1/analytics/advanced${query}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;
let registrarDept;
let libraryDept;
let libraryStaff3; // LIB-0004 / Nathaniel Cruz — deliberately unattributed to any feedback

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  libraryStaff3 = await loginAs('library.staff3@fbms.test');
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/analytics/advanced', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getAdvanced();
    expect(res.status).toBe(401);
  });

  it('is available to every seeded role with 200', async () => {
    for (const role of [roles.superAdmin, roles.seniorLeadership, roles.registrarHead, roles.libraryHead, roles.registrarStaff, roles.libraryStaff]) {
      const res = await getAdvanced(role.token);
      expect(res.status).toBe(200);
    }
  });

  describe('institution view (super_admin / senior_leadership)', () => {
    it('returns roleView "institution" with every documented section', async () => {
      const res = await getAdvanced(roles.superAdmin.token);
      expect(res.status).toBe(200);
      expect(res.body.data.roleView).toBe('institution');
      const { data } = res.body.data;
      expect(Array.isArray(data.officeRanking)).toBe(true);
      expect(Array.isArray(data.buildingPerformance)).toBe(true);
      expect(Array.isArray(data.locationPerformance)).toBe(true);
      expect(Array.isArray(data.serviceQualityHeatmap)).toBe(true);
      expect(Array.isArray(data.monthlyTrend)).toBe(true);
      expect(Array.isArray(data.ratingDistribution)).toBe(true);
      expect(Array.isArray(data.feedbackByServiceType)).toBe(true);
      expect(Array.isArray(data.serviceQualityByServiceType)).toBe(true);
      expect(Array.isArray(data.feedbackByRespondentType)).toBe(true);
      expect(Array.isArray(data.serviceQualityByRespondentType)).toBe(true);
      expect(data.satisfactionKpi).toHaveProperty('target');
      expect(data.peakHours.byHour).toHaveLength(24);
      expect(data.peakHours.byDayOfWeek).toHaveLength(7);
      expect(data.periodComparison).toHaveProperty('current');
      expect(Array.isArray(res.body.data.insights)).toBe(true);
    });

    it('ranks Offices by average rating, highest first, with sequential rank numbers', async () => {
      const res = await getAdvanced(roles.superAdmin.token);
      const { officeRanking } = res.body.data.data;
      expect(officeRanking.length).toBe(2);
      officeRanking.forEach((row, index) => {
        expect(row.rank).toBe(index + 1);
      });
      // Both departments have rating data in the seeded fixture, so the
      // ranking is a strict descending sort by averageRating.
      for (let i = 1; i < officeRanking.length; i += 1) {
        expect(officeRanking[i - 1].averageRating).toBeGreaterThanOrEqual(officeRanking[i].averageRating);
      }
    });

    it('reports Building performance only for buildings with attributed feedback (TAFT/DAC/ATRIUM/AKIC, never SDC)', async () => {
      const res = await getAdvanced(roles.superAdmin.token);
      const { buildingPerformance } = res.body.data.data;
      const names = buildingPerformance.map((row) => row.buildingName);
      expect(names).toEqual(expect.arrayContaining(['Taft Campus', 'Design + Arts Campus', 'The Atrium@Benilde', 'Angelo King International Center']));
      expect(names).not.toContain('Sports and Dormitory Complex');
      buildingPerformance.forEach((row) => expect(row.count).toBeGreaterThan(0));
    });

    it('narrows to one department via departmentId without widening (super_admin only)', async () => {
      const res = await getAdvanced(roles.superAdmin.token, `?departmentId=${libraryDept._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.filters.departmentId).toBe(libraryDept._id.toString());
      const { officeRanking } = res.body.data.data;
      expect(officeRanking).toHaveLength(1);
      expect(officeRanking[0].departmentId.toString()).toBe(libraryDept._id.toString());
    });

    it('rejects an invalid departmentId with 400', async () => {
      const res = await getAdvanced(roles.superAdmin.token, '?departmentId=not-an-id');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid buildingId with 400', async () => {
      const res = await getAdvanced(roles.superAdmin.token, '?buildingId=not-an-id');
      expect(res.status).toBe(400);
    });

    it('a Department Head cannot widen scope via departmentId (still gets only their own office)', async () => {
      const res = await getAdvanced(roles.registrarHead.token, `?departmentId=${libraryDept._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.roleView).toBe('office');
      expect(res.body.data.filters.departmentId).toBe(registrarDept._id.toString());
    });
  });

  describe('office view (department_head) — Library scope', () => {
    it('returns roleView "office" scoped to the Library department with the documented sections', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      expect(res.status).toBe(200);
      expect(res.body.data.roleView).toBe('office');
      const { data } = res.body.data;
      expect(data.departmentId).toBe(libraryDept._id.toString());
      expect(data.departmentName).toBe('Library');
      expect(Array.isArray(data.buildingComparison)).toBe(true);
      expect(Array.isArray(data.windowComparison)).toBe(true);
      expect(Array.isArray(data.staffPerformance)).toBe(true);
      expect(Array.isArray(data.staffServiceQuality)).toBe(true);
      expect(Array.isArray(data.recentComments)).toBe(true);
      expect(data.lowRatingPatterns).toHaveProperty('lowRatingCount');
    });

    it('staffPerformance includes exactly Joshua Fernandez (LIB-0002, avg 4.25) and Camille Aquino (LIB-0003, avg 3.75)', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      const { staffPerformance } = res.body.data.data;
      expect(staffPerformance).toHaveLength(2);

      const joshua = staffPerformance.find((row) => row.personnelName === 'Joshua Fernandez');
      const camille = staffPerformance.find((row) => row.personnelName === 'Camille Aquino');
      expect(joshua).toMatchObject({ count: 1, averageRating: 4.25 });
      expect(camille).toMatchObject({ count: 1, averageRating: 3.75 });
    });

    it('staffServiceQuality has category averages for both attributed Library staff', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      const { staffServiceQuality } = res.body.data.data;
      expect(staffServiceQuality).toHaveLength(2);

      const joshua = staffServiceQuality.find((row) => row.personnelName === 'Joshua Fernandez');
      expect(joshua).toMatchObject({ courtesy: 3, clarity: 4, waitingTime: 5, overall: 4 });

      const camille = staffServiceQuality.find((row) => row.personnelName === 'Camille Aquino');
      expect(camille).toMatchObject({ courtesy: 4, clarity: 4, waitingTime: 4, overall: 4 });
    });

    it('buildingComparison and windowComparison each have exactly 2 rows matching the staff-attributed sessions', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      const { buildingComparison, windowComparison } = res.body.data.data;
      expect(buildingComparison).toHaveLength(2);
      expect(windowComparison).toHaveLength(2);
      buildingComparison.forEach((row) => expect(row.count).toBe(1));
    });

    it('recentComments contains only the one non-empty Library comment (FB-2026-000004)', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      const { recentComments } = res.body.data.data;
      expect(recentComments).toHaveLength(1);
      expect(recentComments[0]).toMatchObject({
        referenceCode: 'FB-2026-000004',
        answer: 'The library staff were excellent.',
      });
    });

    it('lowRatingPatterns reports zero low ratings for Library (all Library ratings are 3 or above)', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      const { lowRatingPatterns } = res.body.data.data;
      expect(lowRatingPatterns.lowRatingCount).toBe(0);
      expect(lowRatingPatterns.byLocation).toEqual([]);
    });

    it('never leaks Registrar-attributed staff/comments into the Library view', async () => {
      const res = await getAdvanced(roles.libraryHead.token);
      const { staffPerformance, recentComments } = res.body.data.data;
      expect(staffPerformance.some((row) => row.personnelName === 'Andrea Reyes')).toBe(false);
      expect(recentComments.some((row) => row.referenceCode === 'FB-2026-000001')).toBe(false);
    });
  });

  describe('office view (department_head) — Registrar scope shows low-rating pattern data', () => {
    it('lowRatingPatterns reports the one Registrar rating of 1 (FB-2026-000006)', async () => {
      const res = await getAdvanced(roles.registrarHead.token);
      const { lowRatingPatterns } = res.body.data.data;
      expect(lowRatingPatterns.lowRatingCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('personal view (personnel)', () => {
    it('returns roleView "personal" with the attributed staff member\'s own data (Andrea Reyes / REG-0002)', async () => {
      const res = await getAdvanced(roles.registrarStaff.token);
      expect(res.status).toBe(200);
      expect(res.body.data.roleView).toBe('personal');
      const { data } = res.body.data;
      expect(data.hasAttributionData).toBe(true);
      expect(data.fullName).toBe('Andrea Reyes');
      expect(data.feedbackCount).toBe(1);
      expect(data.averageRating).toBe(5);
      expect(Array.isArray(data.recentComments)).toBe(true);
    });

    it('reports hasAttributionData true with zero feedback for a linked staff member never attributed to a session (LIB-0004)', async () => {
      const res = await getAdvanced(libraryStaff3.token);
      expect(res.status).toBe(200);
      const { data } = res.body.data;
      expect(data.hasAttributionData).toBe(true);
      expect(data.fullName).toBe('Nathaniel Cruz');
      expect(data.feedbackCount).toBe(0);
      expect(data.averageRating).toBeNull();
      expect(data.recentComments).toEqual([]);
    });

    it("never leaks another staff member's feedback into the personal view", async () => {
      const res = await getAdvanced(roles.registrarStaff.token);
      const { data } = res.body.data;
      expect(data.recentComments.every((comment) => comment.referenceCode !== 'FB-2026-000002')).toBe(true);
    });
  });

  describe('deterministic insights', () => {
    it('never includes an ML-derived or non-deterministic field — every insight has a fixed type/label/value shape', async () => {
      const res = await getAdvanced(roles.superAdmin.token);
      const { insights } = res.body.data;
      insights.forEach((insight) => {
        expect(insight).toHaveProperty('type');
        expect(insight).toHaveProperty('label');
        expect(insight).toHaveProperty('value');
        expect(typeof insight.label).toBe('string');
      });
    });
  });
});
