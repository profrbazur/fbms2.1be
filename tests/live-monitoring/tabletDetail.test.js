import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getDetail = (token, id) =>
  request(app)
    .get(`/api/v1/live-monitoring/tablets/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/live-monitoring/tablets/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getDetail(undefined, target._id.toString());
    expect(res.status).toBe(401);
  });

  it('allows Super Admin to retrieve any tablet\'s monitoring detail', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
    const res = await getDetail(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.tablet.deviceCode).toBe('LIB-TAB-01');
    expect(res.body.data.department.name).toBe('Library');
  });

  it('never exposes activationToken or deviceSecretHash', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getDetail(roles.superAdmin.token, target._id.toString());

    expect(res.body.data.tablet.activationToken).toBeUndefined();
    expect(res.body.data.tablet.deviceSecretHash).toBeUndefined();
  });

  it('includes assigned survey, feedback stats, and status', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getDetail(roles.superAdmin.token, target._id.toString());

    expect(res.body.data.tablet.assignedSurvey.title).toBe('Registrar Office Feedback');
    expect(res.body.data.tablet.feedbackCount).toBe(5);
    expect(res.body.data.tablet.lastFeedbackAt).toBe('2026-08-03T10:10:00.000Z');
    expect(res.body.data.tablet.status).toBe('offline');
  });

  it('allows a Department Head to retrieve their own-department tablet', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getDetail(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(200);
  });

  it('rejects a Department Head retrieving another department\'s tablet with 403', async () => {
    const target = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
    const res = await getDetail(roles.registrarHead.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user retrieving another department\'s tablet with 403', async () => {
    const target = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await getDetail(roles.libraryStaff.token, target._id.toString());

    expect(res.status).toBe(403);
  });

  it('handles a malformed id safely with 404', async () => {
    const res = await getDetail(roles.superAdmin.token, 'not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await getDetail(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});
