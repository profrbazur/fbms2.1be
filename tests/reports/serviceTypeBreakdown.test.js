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

function findRow(rows, name) {
  return rows.find((row) => row.serviceTypeName === name);
}

describe('GET /api/v1/reports/feedback-summary — feedbackByServiceType (V2.6)', () => {
  it('Super Admin sees one row per Service Type with at least one attributed session, computed from actual seeded data', async () => {
    const res = await getReport(roles.superAdmin.token);
    expect(res.status).toBe(200);

    const { feedbackByServiceType } = res.body.data;
    // FB004->LIB-SVC-01 (Borrowing/Returning): ratings [5,3,4,5] -> 17/4 = 4.25
    // FB005->LIB-SVC-03 (Research Assistance): ratings [3,4,4,4] -> 15/4 = 3.75
    // FB007->REG-SVC-01 (Enrollment/Registration): ratings [5,5,5,4] -> 19/4 = 4.75
    // FB008->REG-SVC-03 (Certificates/Documents): ratings [4,4,4,3] -> 15/4 = 3.75
    // FB009->REG-SVC-02 (Student Records): ratings [3,4,3,2] -> 12/4 = 3.0
    // FB010->REG-SVC-06 (Other Inquiry): ratings [5,5,5,5] -> 5.0
    expect(feedbackByServiceType.length).toBe(6);
    expect(feedbackByServiceType.every((row) => row.count === 1)).toBe(true);

    expect(findRow(feedbackByServiceType, 'Borrowing / Returning').averageRating).toBeCloseTo(4.25, 2);
    expect(findRow(feedbackByServiceType, 'Research Assistance').averageRating).toBeCloseTo(3.75, 2);
    expect(findRow(feedbackByServiceType, 'Enrollment / Registration').averageRating).toBeCloseTo(4.75, 2);
    expect(findRow(feedbackByServiceType, 'Certificates / Documents').averageRating).toBeCloseTo(3.75, 2);
    expect(findRow(feedbackByServiceType, 'Student Records').averageRating).toBeCloseTo(3.0, 2);
    expect(findRow(feedbackByServiceType, 'Other Inquiry').averageRating).toBeCloseTo(5.0, 2);
  });

  it('legacy feedback without a serviceTypeId (FB001-003, FB006) never contributes a row', async () => {
    const res = await getReport(roles.superAdmin.token);
    const { feedbackByServiceType } = res.body.data;
    const totalCount = feedbackByServiceType.reduce((sum, row) => sum + row.count, 0);
    // 6 attributed sessions out of 10 total seeded sessions — the other 4
    // (FB001-003, FB006) are legacy/unattributed and correctly excluded.
    expect(totalCount).toBe(6);
  });

  it('Registrar Department Head is scoped to only Registrar\'s own service types', async () => {
    const res = await getReport(roles.registrarHead.token);
    expect(res.status).toBe(200);

    const { feedbackByServiceType } = res.body.data;
    expect(feedbackByServiceType.length).toBe(4);
    expect(
      feedbackByServiceType.every((row) => row.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('a departmentId query parameter cannot widen a Department Head\'s scope', async () => {
    const res = await getReport(roles.registrarHead.token, `?departmentId=${libraryDept._id.toString()}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.feedbackByServiceType.every((row) => row.departmentId === registrarDept._id.toString()),
    ).toBe(true);
  });

  it('returns an empty array when a date filter excludes every attributed session', async () => {
    const res = await getReport(roles.superAdmin.token, '?dateFrom=2030-01-01&dateTo=2030-01-02');
    expect(res.status).toBe(200);
    expect(res.body.data.feedbackByServiceType).toEqual([]);
  });
});

describe('GET /api/v1/reports/feedback-summary — serviceQuality.byServiceType (V2.6)', () => {
  it('one row per Service Type with a categorized rating answer, sorted alphabetically', async () => {
    const res = await getReport(roles.superAdmin.token);
    expect(res.status).toBe(200);

    const { byServiceType } = res.body.data.serviceQuality;
    expect(byServiceType.length).toBe(6);
    expect(byServiceType.map((row) => row.serviceTypeName)).toEqual([
      'Borrowing / Returning',
      'Certificates / Documents',
      'Enrollment / Registration',
      'Other Inquiry',
      'Research Assistance',
      'Student Records',
    ]);

    const enrollment = findRow(byServiceType, 'Enrollment / Registration');
    expect(enrollment.courtesy).toBeCloseTo(5, 2);
    expect(enrollment.clarity).toBeCloseTo(5, 2);
    expect(enrollment.waitingTime).toBeCloseTo(4, 2);
    expect(enrollment.overall).toBeCloseTo(4.67, 2);

    const studentRecords = findRow(byServiceType, 'Student Records');
    expect(studentRecords.courtesy).toBeCloseTo(4, 2);
    expect(studentRecords.clarity).toBeCloseTo(3, 2);
    expect(studentRecords.waitingTime).toBeCloseTo(2, 2);
    expect(studentRecords.overall).toBeCloseTo(3.0, 2);

    const borrowing = findRow(byServiceType, 'Borrowing / Returning');
    expect(borrowing.courtesy).toBeCloseTo(3, 2);
    expect(borrowing.clarity).toBeCloseTo(4, 2);
    expect(borrowing.waitingTime).toBeCloseTo(5, 2);
    expect(borrowing.overall).toBeCloseTo(4.0, 2);
  });

  it('Library Department Head sees only Library\'s own service types', async () => {
    const res = await getReport(roles.libraryHead.token);
    expect(res.status).toBe(200);

    const { byServiceType } = res.body.data.serviceQuality;
    expect(byServiceType.length).toBe(2);
    expect(byServiceType.every((row) => row.departmentId === libraryDept._id.toString())).toBe(true);
  });

  it('returns an empty array for a zero-data date range', async () => {
    const res = await getReport(roles.superAdmin.token, '?dateFrom=2030-01-01&dateTo=2030-01-02');
    expect(res.status).toBe(200);
    expect(res.body.data.serviceQuality.byServiceType).toEqual([]);
  });
});
