import Department from '../models/Department.js';
import Location from '../models/Location.js';
import { listDepartments } from './departmentService.js';
import { listMonitoredTablets } from './liveMonitoringService.js';
import { buildReportFilter, getSatisfactionKpi, getLowRatingPatterns } from './analyticsService.js';

/**
 * V2.10 — Notifications & Monitoring (backend/docs/v2/V2_FUTURE_ROADMAP.md's
 * "Possible: offline tablet, satisfaction below KPI, repeated low-rating
 * pattern" list; the locked implementation scope covers exactly these
 * three). Deliberately DERIVED, not persisted — every notification is
 * recomputed from current state on every request by directly reusing
 * `liveMonitoringService.listMonitoredTablets` (device status),
 * `analyticsService.getSatisfactionKpi` (V2.8), and
 * `analyticsService.getLowRatingPatterns` (V2.9) — no new aggregation
 * pipeline, no new Mongoose model, no Notification collection. `id` is a
 * deterministic string derived from the underlying entity so the frontend
 * can recognize "the same condition" across polling cycles without any
 * server-side identity to persist.
 *
 * Guardrail (frontend/docs/v2/V2_4_STAFF_SESSION_UI.md,
 * V2_9_ADVANCED_ANALYTICS_UI.md, backend/docs/v2/V2_MASTER_ROADMAP.md — all
 * three independently state "avoid punitive alerts from one isolated
 * anonymous rating"): `personnel` never receives satisfaction/low-rating
 * notifications (aggregate, department/office-level signals only — never
 * appropriate to push at an individual), and device-offline for
 * `personnel` is scoped to their own department only, mirroring the exact
 * visibility they already have on the Live Monitoring page.
 */

function departmentDisplayName(departmentNameById, departmentId) {
  return departmentNameById.get(departmentId?.toString()) ?? 'Unknown Department';
}

/**
 * Reuses `listMonitoredTablets` unmodified — same department/location
 * scoping, same `computeTabletStatus` derivation, same "inactive always
 * wins" rule (an inactive/deactivated tablet is never surfaced here,
 * since `status: 'offline'` already excludes `isActive: false` tablets —
 * see `applyStatusFilter` in liveMonitoringService.js). Never queries
 * more than 100 currently-offline tablets — this project's established
 * flat-cap convention for a small dataset (matches Reports'
 * `REPORT_ENTITY_LIMIT`).
 */
async function getDeviceOfflineNotifications(user) {
  const { tablets } = await listMonitoredTablets(user, { status: 'offline', limit: 100 });
  if (tablets.length === 0) return [];

  const departmentIds = [...new Set(tablets.map((tablet) => tablet.departmentId.toString()))];
  const locationIds = [...new Set(tablets.map((tablet) => tablet.locationId.toString()))];

  const [departments, locations] = await Promise.all([
    Department.find({ _id: { $in: departmentIds } }).select('_id name'),
    Location.find({ _id: { $in: locationIds } }).select('_id name'),
  ]);
  const departmentNameById = new Map(departments.map((department) => [department._id.toString(), department.name]));
  const locationNameById = new Map(locations.map((location) => [location._id.toString(), location.name]));

  return tablets.map((tablet) => {
    const locationName = locationNameById.get(tablet.locationId.toString()) ?? 'Unknown Location';
    const departmentName = departmentDisplayName(departmentNameById, tablet.departmentId);
    return {
      id: `device-offline:${tablet._id}`,
      type: 'device_offline',
      severity: 'warning',
      title: `${tablet.deviceName} is offline`,
      message: `Tablet at ${locationName} is currently offline.`,
      scope: {
        departmentId: tablet.departmentId,
        departmentName,
        locationId: tablet.locationId,
        locationName,
        tabletId: tablet._id,
      },
      metadata: { deviceCode: tablet.deviceCode, lastSeen: tablet.lastSeen },
    };
  });
}

/**
 * Reuses `analyticsService.getSatisfactionKpi` unmodified, called once per
 * visible Department (`departmentService.listDepartments` already applies
 * the exact same role-scoping idiom every other module uses — global roles
 * see every active department, Department Head sees only their own single
 * department, wrapped in an array). Only `status === 'below_target'`
 * produces a notification; `above_target`/`on_target`/`no_data` never do
 * (a department with no rating data yet is not an actionable condition).
 * Never called for `personnel` — see this file's own header comment.
 */
async function getSatisfactionBelowTargetNotifications(user) {
  if (user.role === 'personnel') return [];

  const departments = await listDepartments(user, { isActive: true });
  if (departments.length === 0) return [];

  const results = await Promise.all(
    departments.map(async (department) => {
      const filter = buildReportFilter(user, { departmentId: department._id.toString() });
      const kpi = await getSatisfactionKpi(filter, { departmentId: department._id });
      if (kpi.status !== 'below_target') return null;

      return {
        id: `satisfaction-below-target:${department._id}`,
        type: 'satisfaction_below_target',
        severity: 'danger',
        title: `${department.name} satisfaction is below target`,
        message: `${department.name} satisfaction is below its configured target.`,
        scope: { departmentId: department._id, departmentName: department.name },
        metadata: { actual: kpi.actual, target: kpi.target, variance: kpi.variance },
      };
    }),
  );

  return results.filter((notification) => notification !== null);
}

/**
 * Reuses `analyticsService.getLowRatingPatterns` unmodified — its own
 * existing 2+-occurrence-per-Location threshold (V2.9) is the sole
 * "repeated" signal; a single isolated low rating never produces a row in
 * `byLocation` and therefore never produces a notification here. Never
 * called for `personnel` — see this file's own header comment. `filter`
 * scope matches every other module's role idiom: institution-wide for
 * global roles, pinned to their own department for Department Head.
 */
async function getRepeatedLowRatingNotifications(user) {
  if (user.role === 'personnel') return [];

  const filter = buildReportFilter(user, {});
  if (filter === null) return [];

  const pattern = await getLowRatingPatterns(filter);
  if (pattern.byLocation.length === 0) return [];

  return pattern.byLocation.map((row) => ({
    id: `repeated-low-rating:${row.locationId}`,
    type: 'repeated_low_rating',
    severity: 'danger',
    title: `Repeated low ratings at ${row.locationName}`,
    message: `Repeated low-rating pattern detected at ${row.locationName}.`,
    scope: { locationId: row.locationId, locationName: row.locationName },
    metadata: { lowRatingCount: row.lowRatingCount },
  }));
}

/**
 * Entry point for `GET /api/v1/notifications`. Every category is derived
 * independently and combined — no notification is ever targeted at a
 * named Personnel record (device-offline scope is department/location
 * only; satisfaction/low-rating are department/location aggregates).
 */
export async function getNotifications(user) {
  const [deviceOffline, satisfactionBelowTarget, repeatedLowRating] = await Promise.all([
    getDeviceOfflineNotifications(user),
    getSatisfactionBelowTargetNotifications(user),
    getRepeatedLowRatingNotifications(user),
  ]);

  const notifications = [...deviceOffline, ...satisfactionBelowTarget, ...repeatedLowRating];

  return {
    notifications,
    counts: {
      total: notifications.length,
      deviceOffline: deviceOffline.length,
      satisfactionBelowTarget: satisfactionBelowTarget.length,
      repeatedLowRating: repeatedLowRating.length,
    },
  };
}
