import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';
import { buildFeedbackScopeFilter, getLowRatingPatterns } from '../../src/services/analyticsService.js';

const getNotifications = (token, query = '') =>
  request(app)
    .get(`/api/v1/notifications${query}`)
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

describe('GET /api/v1/notifications', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getNotifications();
    expect(res.status).toBe(401);
  });

  it('is available to every seeded role with 200 and a deterministic response shape', async () => {
    for (const role of [roles.superAdmin, roles.seniorLeadership, roles.registrarHead, roles.libraryHead, roles.registrarStaff, roles.libraryStaff]) {
      const res = await getNotifications(role.token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.notifications)).toBe(true);
      expect(res.body.data.counts).toHaveProperty('total');
      res.body.data.notifications.forEach((notification) => {
        expect(notification).toHaveProperty('id');
        expect(notification).toHaveProperty('type');
        expect(['device_offline', 'satisfaction_below_target', 'repeated_low_rating']).toContain(notification.type);
        expect(['warning', 'danger']).toContain(notification.severity);
        expect(typeof notification.title).toBe('string');
        expect(typeof notification.message).toBe('string');
      });
    }
  });

  describe('device offline', () => {
    it('the freshly-seeded fixture has every tablet with no recorded heartbeat, so all 4 seeded tablets are offline institution-wide (Super Admin)', async () => {
      const res = await getNotifications(roles.superAdmin.token);
      const offline = res.body.data.notifications.filter((n) => n.type === 'device_offline');
      const totalTablets = await Tablet.countDocuments({ isActive: true });
      expect(offline.length).toBe(totalTablets);
      offline.forEach((n) => {
        expect(n.severity).toBe('warning');
        expect(n.scope).toHaveProperty('tabletId');
        expect(n.scope).toHaveProperty('departmentId');
        expect(n.scope).toHaveProperty('locationId');
      });
    });

    it('never surfaces an inactive tablet as offline (inactive always wins, matching computeTabletStatus)', async () => {
      const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
      await Tablet.findByIdAndUpdate(tablet._id, { isActive: false });

      const res = await getNotifications(roles.superAdmin.token);
      const offline = res.body.data.notifications.filter((n) => n.type === 'device_offline');
      expect(offline.some((n) => n.scope.tabletId === tablet._id.toString())).toBe(false);

      await Tablet.findByIdAndUpdate(tablet._id, { isActive: true });
    });

    it('an online tablet (recent heartbeat) never produces a device_offline notification', async () => {
      const tablet = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });
      await Tablet.findByIdAndUpdate(tablet._id, { lastSeen: new Date() });

      const res = await getNotifications(roles.libraryHead.token);
      const offline = res.body.data.notifications.filter((n) => n.type === 'device_offline');
      expect(offline.some((n) => n.scope.tabletId === tablet._id.toString())).toBe(false);

      await Tablet.findByIdAndUpdate(tablet._id, { lastSeen: null });
    });

    it('Department Head sees device_offline scoped to only their own department', async () => {
      const res = await getNotifications(roles.registrarHead.token);
      const offline = res.body.data.notifications.filter((n) => n.type === 'device_offline');
      expect(offline.length).toBeGreaterThan(0);
      offline.forEach((n) => expect(n.scope.departmentId).toBe(registrarDept._id.toString()));
    });

    it('Personnel also sees device_offline scoped to only their own department (matching their existing Live Monitoring access)', async () => {
      const res = await getNotifications(roles.libraryStaff.token);
      const offline = res.body.data.notifications.filter((n) => n.type === 'device_offline');
      expect(offline.length).toBeGreaterThan(0);
      offline.forEach((n) => expect(n.scope.departmentId).toBe(libraryDept._id.toString()));
    });
  });

  describe('satisfaction below target', () => {
    it('Registrar (below_target in the seeded fixture) produces a notification institution-wide', async () => {
      const res = await getNotifications(roles.superAdmin.token);
      const belowTarget = res.body.data.notifications.filter((n) => n.type === 'satisfaction_below_target');
      const registrarNotification = belowTarget.find((n) => n.scope.departmentId === registrarDept._id.toString());
      expect(registrarNotification).toBeDefined();
      expect(registrarNotification.severity).toBe('danger');
      expect(registrarNotification.metadata.actual).toBeLessThan(registrarNotification.metadata.target);
    });

    it('Library (on_target, actual === target, in the seeded fixture) never produces a satisfaction_below_target notification', async () => {
      const res = await getNotifications(roles.superAdmin.token);
      const belowTarget = res.body.data.notifications.filter((n) => n.type === 'satisfaction_below_target');
      expect(belowTarget.some((n) => n.scope.departmentId === libraryDept._id.toString())).toBe(false);
    });

    it('Department Head only ever sees their own department in satisfaction_below_target (Library Head sees none)', async () => {
      const res = await getNotifications(roles.libraryHead.token);
      const belowTarget = res.body.data.notifications.filter((n) => n.type === 'satisfaction_below_target');
      expect(belowTarget).toHaveLength(0);
    });

    it('Registrar Head sees their own below-target department notification', async () => {
      const res = await getNotifications(roles.registrarHead.token);
      const belowTarget = res.body.data.notifications.filter((n) => n.type === 'satisfaction_below_target');
      expect(belowTarget).toHaveLength(1);
      expect(belowTarget[0].scope.departmentId).toBe(registrarDept._id.toString());
    });

    it('Personnel never receives satisfaction_below_target notifications', async () => {
      const res = await getNotifications(roles.registrarStaff.token);
      const belowTarget = res.body.data.notifications.filter((n) => n.type === 'satisfaction_below_target');
      expect(belowTarget).toHaveLength(0);
    });
  });

  describe('repeated low-rating pattern', () => {
    it('is consistent with analyticsService.getLowRatingPatterns institution-wide (only 2+-occurrence locations, never a single isolated rating)', async () => {
      const res = await getNotifications(roles.superAdmin.token);
      const repeated = res.body.data.notifications.filter((n) => n.type === 'repeated_low_rating');

      const filter = buildFeedbackScopeFilter(roles.superAdmin.user);
      const expectedPattern = await getLowRatingPatterns(filter);

      expect(repeated).toHaveLength(expectedPattern.byLocation.length);
      repeated.forEach((n) => {
        expect(n.metadata.lowRatingCount).toBeGreaterThanOrEqual(2);
        expect(n.severity).toBe('danger');
      });
    });

    it('Personnel never receives repeated_low_rating notifications', async () => {
      const res = await getNotifications(roles.registrarStaff.token);
      const repeated = res.body.data.notifications.filter((n) => n.type === 'repeated_low_rating');
      expect(repeated).toHaveLength(0);
    });

    it("a Department Head's repeated_low_rating notifications are consistent with their own department's getLowRatingPatterns scope", async () => {
      const res = await getNotifications(roles.registrarHead.token);
      const repeated = res.body.data.notifications.filter((n) => n.type === 'repeated_low_rating');

      const filter = buildFeedbackScopeFilter(roles.registrarHead.user);
      const expectedPattern = await getLowRatingPatterns(filter);

      expect(repeated).toHaveLength(expectedPattern.byLocation.length);
    });
  });

  describe('scoping / no personnel-targeted punitive alert', () => {
    it('no notification of any type ever includes a personnelId or individually-named-employee field', async () => {
      const res = await getNotifications(roles.superAdmin.token);
      res.body.data.notifications.forEach((notification) => {
        expect(notification.scope).not.toHaveProperty('personnelId');
        expect(notification).not.toHaveProperty('personnelId');
        expect(JSON.stringify(notification)).not.toMatch(/employeeNumber/i);
      });
    });

    it('a departmentId query parameter has no effect (the endpoint accepts no such override) — Department Head cannot widen scope', async () => {
      const res = await getNotifications(roles.registrarHead.token, `?departmentId=${libraryDept._id}`);
      expect(res.status).toBe(200);
      const belowTarget = res.body.data.notifications.filter((n) => n.type === 'satisfaction_below_target');
      expect(belowTarget.every((n) => n.scope.departmentId === registrarDept._id.toString())).toBe(true);
      const offline = res.body.data.notifications.filter((n) => n.type === 'device_offline');
      expect(offline.every((n) => n.scope.departmentId === registrarDept._id.toString())).toBe(true);
    });

    it('Senior Leadership receives the same institution-wide scope as Super Admin', async () => {
      const [adminRes, leadershipRes] = await Promise.all([
        getNotifications(roles.superAdmin.token),
        getNotifications(roles.seniorLeadership.token),
      ]);
      expect(leadershipRes.body.data.counts.total).toBe(adminRes.body.data.counts.total);
    });
  });
});
