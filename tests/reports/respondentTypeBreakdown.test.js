import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
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

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
});

afterAll(async () => {
  await disconnectTestDb();
});

function findRow(rows, respondentType) {
  return rows.find((row) => row.respondentType === respondentType);
}

// Seeded distribution (backend/src/seeders/feedbackSeeder.js):
// student: FB001 (no serviceType), FB004 (LIB-SVC-01), FB007 (REG-SVC-01), FB010 (REG-SVC-06)
// employee: FB002 (no serviceType), FB005 (LIB-SVC-03), FB009 (REG-SVC-02)
// visitor: FB003 (no serviceType), FB008 (REG-SVC-03)
// FB006 has neither a serviceTypeCode nor a respondentType (fully legacy).
describe('GET /api/v1/reports/feedback-summary — feedbackByRespondentType (V2.7)', () => {
  it('Super Admin sees one row per Respondent Type, computed from actual seeded data', async () => {
    const res = await getReport(roles.superAdmin.token);
    expect(res.status).toBe(200);

    const { feedbackByRespondentType } = res.body.data;
    expect(feedbackByRespondentType.length).toBe(3);

    const student = findRow(feedbackByRespondentType, 'student');
    expect(student.respondentTypeLabel).toBe('Student');
    expect(student.count).toBe(4);
    expect(student.averageRating).toBeCloseTo(4.69, 2);

    const employee = findRow(feedbackByRespondentType, 'employee');
    expect(employee.count).toBe(3);
    expect(employee.averageRating).toBeCloseTo(3.44, 2);

    const visitor = findRow(feedbackByRespondentType, 'visitor');
    expect(visitor.count).toBe(2);
    expect(visitor.averageRating).toBeCloseTo(3.4, 2);
  });

  it('legacy feedback without a respondentType (FB006) never contributes a row', async () => {
    const res = await getReport(roles.superAdmin.token);
    const { feedbackByRespondentType } = res.body.data;
    const totalCount = feedbackByRespondentType.reduce((sum, row) => sum + row.count, 0);
    // 9 attributed sessions out of 10 total seeded sessions.
    expect(totalCount).toBe(9);
  });

  it("Registrar Department Head is scoped to only Registrar's own sessions", async () => {
    const res = await getReport(roles.registrarHead.token);
    expect(res.status).toBe(200);

    const { feedbackByRespondentType } = res.body.data;
    // FB004/FB005 are Library-only, so Registrar loses one student and one
    // employee session relative to the system-wide totals.
    expect(findRow(feedbackByRespondentType, 'student').count).toBe(3);
    expect(findRow(feedbackByRespondentType, 'employee').count).toBe(2);
    expect(findRow(feedbackByRespondentType, 'visitor').count).toBe(2);
  });

  it('returns an empty array when a date filter excludes every attributed session', async () => {
    const res = await getReport(roles.superAdmin.token, '?dateFrom=2030-01-01&dateTo=2030-01-02');
    expect(res.status).toBe(200);
    expect(res.body.data.feedbackByRespondentType).toEqual([]);
  });
});

describe('GET /api/v1/reports/feedback-summary — serviceQuality.byRespondentType (V2.7)', () => {
  it('one row per Respondent Type with a categorized rating answer', async () => {
    const res = await getReport(roles.superAdmin.token);
    expect(res.status).toBe(200);

    const { byRespondentType } = res.body.data.serviceQuality;
    expect(byRespondentType.length).toBe(3);

    const student = findRow(byRespondentType, 'student');
    expect(student.courtesy).toBeCloseTo(4.33, 2);
    expect(student.clarity).toBeCloseTo(4.67, 2);
    expect(student.waitingTime).toBeCloseTo(4.67, 2);
    expect(student.overall).toBeCloseTo(4.56, 2);

    const employee = findRow(byRespondentType, 'employee');
    expect(employee.courtesy).toBeCloseTo(4.0, 2);
    expect(employee.clarity).toBeCloseTo(3.5, 2);
    expect(employee.waitingTime).toBeCloseTo(3.0, 2);
    expect(employee.overall).toBeCloseTo(3.5, 2);

    const visitor = findRow(byRespondentType, 'visitor');
    expect(visitor.courtesy).toBeCloseTo(4.0, 2);
    expect(visitor.clarity).toBeCloseTo(4.0, 2);
    expect(visitor.waitingTime).toBeCloseTo(3.0, 2);
    expect(visitor.overall).toBeCloseTo(3.67, 2);
  });

  it('returns an empty array for a zero-data date range', async () => {
    const res = await getReport(roles.superAdmin.token, '?dateFrom=2030-01-01&dateTo=2030-01-02');
    expect(res.status).toBe(200);
    expect(res.body.data.serviceQuality.byRespondentType).toEqual([]);
  });
});

describe('GET /api/v1/reports/feedback-summary — feedbackByServiceTypeAndRespondentType (V2.7)', () => {
  it('one row per session carrying both a serviceTypeId and a respondentType', async () => {
    const res = await getReport(roles.superAdmin.token);
    expect(res.status).toBe(200);

    const { feedbackByServiceTypeAndRespondentType } = res.body.data;
    // FB004,005,007,008,009,010 each carry both dimensions; FB001-003/006
    // carry at most one (or neither) and never contribute a row here.
    expect(feedbackByServiceTypeAndRespondentType.length).toBe(6);
    expect(feedbackByServiceTypeAndRespondentType.every((row) => row.count === 1)).toBe(true);

    const enrollment = feedbackByServiceTypeAndRespondentType.find(
      (row) => row.serviceTypeName === 'Enrollment / Registration',
    );
    expect(enrollment.respondentType).toBe('student');
    expect(enrollment.averageRating).toBeCloseTo(4.75, 2);

    const borrowing = feedbackByServiceTypeAndRespondentType.find(
      (row) => row.serviceTypeName === 'Borrowing / Returning',
    );
    expect(borrowing.respondentType).toBe('student');
    expect(borrowing.averageRating).toBeCloseTo(4.25, 2);

    const studentRecords = feedbackByServiceTypeAndRespondentType.find(
      (row) => row.serviceTypeName === 'Student Records',
    );
    expect(studentRecords.respondentType).toBe('employee');
    expect(studentRecords.averageRating).toBeCloseTo(3.0, 2);
  });

  it("Library Department Head sees only Library's own combinations", async () => {
    const res = await getReport(roles.libraryHead.token);
    expect(res.status).toBe(200);

    const { feedbackByServiceTypeAndRespondentType } = res.body.data;
    expect(feedbackByServiceTypeAndRespondentType.length).toBe(2);
    expect(
      feedbackByServiceTypeAndRespondentType.every((row) => row.departmentId === libraryDept._id.toString()),
    ).toBe(true);
  });

  it('a departmentId query parameter cannot widen a Department Head\'s scope', async () => {
    const res = await getReport(roles.registrarHead.token, `?departmentId=${libraryDept._id.toString()}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.feedbackByServiceTypeAndRespondentType.every(
        (row) => row.departmentId === registrarDept._id.toString(),
      ),
    ).toBe(true);
  });

  it('returns an empty array for a zero-data date range', async () => {
    const res = await getReport(roles.superAdmin.token, '?dateFrom=2030-01-01&dateTo=2030-01-02');
    expect(res.status).toBe(200);
    expect(res.body.data.feedbackByServiceTypeAndRespondentType).toEqual([]);
  });
});
