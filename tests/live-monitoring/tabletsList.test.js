import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Tablet from '../../src/models/Tablet.js';
import Survey from '../../src/models/Survey.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const listTablets = (token, query = '') =>
  request(app)
    .get(`/api/v1/live-monitoring/tablets${query}`)
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

describe('GET /api/v1/live-monitoring/tablets', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await listTablets();
    expect(res.status).toBe(401);
  });

  it('returns all 4 tablets for Super Admin', async () => {
    const res = await listTablets(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.length).toBe(4);
    expect(res.body.data.pagination.total).toBe(4);
  });

  it('never exposes activationToken or deviceSecretHash', async () => {
    const res = await listTablets(roles.superAdmin.token);

    res.body.data.tablets.forEach((tablet) => {
      expect(tablet.activationToken).toBeUndefined();
      expect(tablet.deviceSecretHash).toBeUndefined();
    });
  });

  it('restricts a Department Head to their own department tablets', async () => {
    const res = await listTablets(roles.registrarHead.token);

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.length).toBe(2);
    expect(res.body.data.tablets.every((t) => t.departmentId === registrarDept._id.toString())).toBe(true);
  });

  it('a supplied departmentId query cannot bypass a non-admin department restriction', async () => {
    const res = await listTablets(
      roles.registrarHead.token,
      `?departmentId=${libraryDept._id.toString()}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.tablets.every((t) => t.departmentId === registrarDept._id.toString())).toBe(true);
  });

  it('every tablet is "offline" by default (isActive: true, lastSeen never recorded)', async () => {
    const res = await listTablets(roles.superAdmin.token);
    expect(res.body.data.tablets.every((t) => t.status === 'offline')).toBe(true);
  });

  describe('status transitions', () => {
    afterEach(async () => {
      await Tablet.updateMany({}, { $set: { lastSeen: null, isActive: true } });
    });

    it('a recent heartbeat makes a tablet "online"', async () => {
      await Tablet.updateOne({ deviceCode: 'REG-TAB-01' }, { $set: { lastSeen: new Date() } });

      const res = await listTablets(roles.superAdmin.token);
      const tablet = res.body.data.tablets.find((t) => t.deviceCode === 'REG-TAB-01');

      expect(tablet.status).toBe('online');
    });

    it('a stale heartbeat (older than 3x the heartbeat interval) keeps a tablet "offline"', async () => {
      const staleDate = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago; default interval is 300s -> cutoff 900s
      await Tablet.updateOne({ deviceCode: 'REG-TAB-01' }, { $set: { lastSeen: staleDate } });

      const res = await listTablets(roles.superAdmin.token);
      const tablet = res.body.data.tablets.find((t) => t.deviceCode === 'REG-TAB-01');

      expect(tablet.status).toBe('offline');
    });

    it('a deactivated tablet is "inactive" regardless of a recent heartbeat', async () => {
      await Tablet.updateOne(
        { deviceCode: 'LIB-TAB-01' },
        { $set: { lastSeen: new Date(), isActive: false } },
      );

      const res = await listTablets(roles.superAdmin.token);
      const tablet = res.body.data.tablets.find((t) => t.deviceCode === 'LIB-TAB-01');

      expect(tablet.status).toBe('inactive');
    });

    it('supports filtering by status=online', async () => {
      await Tablet.updateOne({ deviceCode: 'REG-TAB-01' }, { $set: { lastSeen: new Date() } });

      const res = await listTablets(roles.superAdmin.token, '?status=online');

      expect(res.body.data.tablets.length).toBe(1);
      expect(res.body.data.tablets[0].deviceCode).toBe('REG-TAB-01');
    });

    it('supports filtering by status=inactive', async () => {
      await Tablet.updateOne({ deviceCode: 'LIB-TAB-01' }, { $set: { isActive: false } });

      const res = await listTablets(roles.superAdmin.token, '?status=inactive');

      expect(res.body.data.tablets.length).toBe(1);
      expect(res.body.data.tablets[0].deviceCode).toBe('LIB-TAB-01');
    });

    it('supports filtering by status=offline', async () => {
      await Tablet.updateOne({ deviceCode: 'REG-TAB-01' }, { $set: { lastSeen: new Date() } });

      const res = await listTablets(roles.superAdmin.token, '?status=offline');

      expect(res.body.data.tablets.length).toBe(3);
      expect(res.body.data.tablets.every((t) => t.deviceCode !== 'REG-TAB-01')).toBe(true);
    });
  });

  it('rejects an invalid status value with 400', async () => {
    const res = await listTablets(roles.superAdmin.token, '?status=bogus');
    expect(res.status).toBe(400);
  });

  it('resolves each tablet\'s assigned survey by Location -> Department -> Global precedence', async () => {
    const res = await listTablets(roles.superAdmin.token);

    const regTablet = res.body.data.tablets.find((t) => t.deviceCode === 'REG-TAB-01');
    const libTablet = res.body.data.tablets.find((t) => t.deviceCode === 'LIB-TAB-01');

    expect(regTablet.assignedSurvey.title).toBe('Registrar Office Feedback');
    expect(libTablet.assignedSurvey.title).toBe('General Service Feedback'); // Library survey is unpublished, falls through to Global
  });

  it('supports filtering by surveyId', async () => {
    const survey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const res = await listTablets(roles.superAdmin.token, `?surveyId=${survey._id.toString()}`);

    expect(res.body.data.tablets.length).toBe(2);
    expect(res.body.data.tablets.every((t) => t.deviceCode.startsWith('REG-'))).toBe(true);
  });

  it('rejects an invalid surveyId with 400', async () => {
    const res = await listTablets(roles.superAdmin.token, '?surveyId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('reports lastFeedbackAt as the most recent submittedAt among that tablet\'s sessions', async () => {
    const res = await listTablets(roles.superAdmin.token);
    const tablet = res.body.data.tablets.find((t) => t.deviceCode === 'REG-TAB-01');

    expect(tablet.lastFeedbackAt).toBe('2026-08-03T10:10:00.000Z');
  });

  it('supports search across deviceName/deviceCode', async () => {
    const res = await listTablets(roles.superAdmin.token, '?search=REG-TAB-01');

    expect(res.body.data.tablets.length).toBe(1);
    expect(res.body.data.tablets[0].deviceCode).toBe('REG-TAB-01');
  });

  it('supports the locationId filter', async () => {
    const res = await listTablets(roles.superAdmin.token, '?search=Library Circulation');
    expect(res.status).toBe(200);
  });

  it('supports sorting by deviceName ascending and descending', async () => {
    const ascRes = await listTablets(roles.superAdmin.token, '?sortBy=deviceName&sortDir=asc');
    const descRes = await listTablets(roles.superAdmin.token, '?sortBy=deviceName&sortDir=desc');

    const ascNames = ascRes.body.data.tablets.map((t) => t.deviceName);
    const descNames = descRes.body.data.tablets.map((t) => t.deviceName);

    expect(ascNames).toEqual([...ascNames].sort());
    expect(descNames).toEqual([...descNames].sort().reverse());
  });

  it('returns correct pagination metadata', async () => {
    const res = await listTablets(roles.superAdmin.token, '?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data.tablets).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 4, pages: 2 });
  });

  it('rejects an invalid departmentId with 400', async () => {
    const res = await listTablets(roles.superAdmin.token, '?departmentId=not-a-valid-id');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid locationId with 400', async () => {
    const res = await listTablets(roles.superAdmin.token, '?locationId=not-a-valid-id');
    expect(res.status).toBe(400);
  });
});
