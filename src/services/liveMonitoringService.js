import Tablet from '../models/Tablet.js';
import Survey from '../models/Survey.js';
import FeedbackSession from '../models/FeedbackSession.js';
import Department from '../models/Department.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import { getOrganizationSettings } from './organizationService.js';
import { listDepartments } from './departmentService.js';
import { listLocations } from './locationService.js';
import { listSurveys } from './surveyService.js';

/**
 * A tablet with no heartbeat inside this many multiples of
 * `OrganizationSettings.mobileHeartbeatIntervalSeconds` (P5.1, default
 * 300s) is considered Offline rather than Online. Single shared constant
 * per this phase's "one shared constant" polling/threshold requirement —
 * every online/offline computation in this file goes through
 * `getOfflineCutoffDate`, never a locally re-derived threshold.
 */
const OFFLINE_THRESHOLD_MULTIPLIER = 3;

// Never expose Tablet.activationToken through Live Monitoring (this
// phase's explicit "Never expose Activation Token" requirement) —
// deviceSecretHash is already select:false on the model itself and needs
// no explicit exclusion here.
const TABLET_PROJECTION = '-activationToken';

function emptyPagination(limit) {
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  return { page: 1, limit: limitNum, total: 0, pages: 0 };
}

async function getOfflineCutoffDate() {
  const settings = await getOrganizationSettings();
  const thresholdMs = settings.mobileHeartbeatIntervalSeconds * OFFLINE_THRESHOLD_MULTIPLIER * 1000;
  return new Date(Date.now() - thresholdMs);
}

/**
 * Status is always derived, never stored — per this phase's "Determine
 * automatically... Do not require manual status updates" requirement.
 * `isActive: false` always wins over heartbeat recency (a deactivated
 * tablet is Inactive even if it heartbeat a second ago).
 */
export function computeTabletStatus(tablet, cutoffDate) {
  if (!tablet.isActive) return 'inactive';
  if (tablet.lastSeen && tablet.lastSeen.getTime() >= cutoffDate.getTime()) return 'online';
  return 'offline';
}

/**
 * Same department-scoping shape as tabletService.listTablets (Department
 * Head/Personnel always pinned to their own department; a client-supplied
 * departmentId cannot widen that for non-Super-Admin) — kept as a
 * self-contained copy here rather than importing a refactor of
 * tabletService.js, since this phase could not re-run that module's
 * existing test suite in this environment to safely verify a shared-helper
 * extraction (see the P6.2 completion report's Known Limitations).
 */
function buildTabletScopeFilter(user, { departmentId, locationId } = {}) {
  const filter = {};

  if (isGlobalReadRole(user.role)) {
    if (departmentId) {
      if (!isValidObjectId(departmentId)) {
        throw new ApiError(400, 'departmentId must be a valid id.', [
          { field: 'departmentId', message: 'Invalid department id.' },
        ]);
      }
      filter.departmentId = departmentId;
    }
  } else {
    if (!user.departmentId) return null;
    filter.departmentId = user.departmentId;
  }

  if (locationId) {
    if (!isValidObjectId(locationId)) {
      throw new ApiError(400, 'locationId must be a valid id.', [
        { field: 'locationId', message: 'Invalid location id.' },
      ]);
    }
    filter.locationId = locationId;
  }

  return filter;
}

function applyStatusFilter(filter, status, cutoffDate) {
  if (!status) return;

  if (status === 'inactive') {
    filter.isActive = false;
    return;
  }

  if (status === 'online') {
    filter.isActive = true;
    filter.lastSeen = { $gte: cutoffDate };
    return;
  }

  if (status === 'offline') {
    filter.isActive = true;
    filter.$or = [{ lastSeen: null }, { lastSeen: { $lt: cutoffDate } }];
    return;
  }

  throw new ApiError(400, 'status must be one of: online, offline, inactive.', [
    { field: 'status', message: 'status must be one of: online, offline, inactive.' },
  ]);
}

/**
 * Resolves each tablet's currently-active survey in one batched query
 * (Location → Department → Global precedence — the identical rule
 * `mobileService.resolveActiveSurveyForTablet` applies per-tablet, kept
 * consistent here but re-implemented as a single query across every
 * tablet's locationId/departmentId, then resolved in memory) rather than
 * calling that function once per tablet, which would be an N+1 query
 * pattern for a list of tablets — this phase's explicit "Avoid N+1
 * queries" requirement.
 */
async function resolveActiveSurveysForTablets(tablets) {
  const result = new Map();
  if (tablets.length === 0) return result;

  const locationIds = [...new Set(tablets.map((t) => t.locationId.toString()))];
  const departmentIds = [...new Set(tablets.map((t) => t.departmentId.toString()))];

  const candidateSurveys = await Survey.find({
    isPublished: true,
    isArchived: false,
    $or: [
      { locationId: { $in: locationIds } },
      { departmentId: { $in: departmentIds }, locationId: null },
      { departmentId: null, locationId: null },
    ],
  }).select('_id title departmentId locationId');

  const byLocation = new Map();
  const byDepartment = new Map();
  let global = null;

  candidateSurveys.forEach((survey) => {
    if (survey.locationId) {
      byLocation.set(survey.locationId.toString(), survey);
    } else if (survey.departmentId) {
      byDepartment.set(survey.departmentId.toString(), survey);
    } else {
      global = survey;
    }
  });

  tablets.forEach((tablet) => {
    const resolved =
      byLocation.get(tablet.locationId.toString()) ||
      byDepartment.get(tablet.departmentId.toString()) ||
      global ||
      null;
    result.set(tablet._id.toString(), resolved);
  });

  return result;
}

/**
 * Single aggregation covering both the list's "Last Feedback" column and
 * the detail drawer's "Last Feedback Timestamp"/"Total Feedback Count" —
 * one query for whichever subset of tablets the caller needs, never one
 * query per tablet. Exported (P7.1) so Reports' Tablet Contribution table
 * can reuse it exactly rather than duplicating this aggregation — the
 * optional `extraMatch` (e.g. a `surveyId`/`submittedAt` narrowing) is
 * additive and defaults to `{}`, so this module's own two existing call
 * sites (which never pass it) are unaffected.
 */
export async function getFeedbackStatsForTablets(tabletIds, extraMatch = {}) {
  const result = new Map();
  if (tabletIds.length === 0) return result;

  const stats = await FeedbackSession.aggregate([
    { $match: { tabletId: { $in: tabletIds }, ...extraMatch } },
    { $group: { _id: '$tabletId', lastFeedbackAt: { $max: '$submittedAt' }, feedbackCount: { $sum: 1 } } },
  ]);

  stats.forEach((row) => {
    result.set(row._id.toString(), { lastFeedbackAt: row.lastFeedbackAt, feedbackCount: row.feedbackCount });
  });

  return result;
}

function serializeTablet(tablet, { cutoffDate, assignedSurvey, feedbackStats }) {
  const stats = feedbackStats || {};

  return {
    _id: tablet._id,
    deviceCode: tablet.deviceCode,
    deviceName: tablet.deviceName,
    departmentId: tablet.departmentId,
    locationId: tablet.locationId,
    isActive: tablet.isActive,
    lastSeen: tablet.lastSeen,
    appVersion: tablet.appVersion,
    androidVersion: tablet.androidVersion,
    activationConsumedAt: tablet.activationConsumedAt,
    status: computeTabletStatus(tablet, cutoffDate),
    assignedSurvey: assignedSurvey ? { _id: assignedSurvey._id, title: assignedSurvey.title } : null,
    lastFeedbackAt: stats.lastFeedbackAt ?? null,
    feedbackCount: stats.feedbackCount ?? 0,
  };
}

/**
 * Dashboard summary cards. Every count is scoped identically to how the
 * rest of this module (and Tablets/Feedback/Surveys) scope Department
 * Head/Personnel to their own department — reuses each resource's own
 * already-tested, role-scoped list function rather than re-deriving that
 * scoping logic a third time (departmentService.listDepartments,
 * locationService.listLocations, surveyService.listSurveys).
 */
export async function getLiveMonitoringSummary(user) {
  const cutoffDate = await getOfflineCutoffDate();
  const tabletFilter = buildTabletScopeFilter(user);

  if (tabletFilter === null) {
    return {
      onlineCount: 0,
      offlineCount: 0,
      inactiveCount: 0,
      feedbackToday: 0,
      activeSurveysCount: 0,
      departmentsCount: 0,
      locationsCount: 0,
    };
  }

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const onlineFilter = { ...tabletFilter, isActive: true, lastSeen: { $gte: cutoffDate } };
  const offlineFilter = { ...tabletFilter, isActive: true, $or: [{ lastSeen: null }, { lastSeen: { $lt: cutoffDate } }] };
  const inactiveFilter = { ...tabletFilter, isActive: false };

  const feedbackTodayFilter = { submittedAt: { $gte: startOfToday } };
  if (tabletFilter.departmentId) {
    feedbackTodayFilter.departmentId = tabletFilter.departmentId;
  }

  const [
    onlineCount,
    offlineCount,
    inactiveCount,
    feedbackToday,
    activeSurveys,
    departments,
    locations,
  ] = await Promise.all([
    Tablet.countDocuments(onlineFilter),
    Tablet.countDocuments(offlineFilter),
    Tablet.countDocuments(inactiveFilter),
    FeedbackSession.countDocuments(feedbackTodayFilter),
    listSurveys(user, { isPublished: true, isArchived: false, limit: 1 }),
    listDepartments(user, { isActive: true }),
    listLocations(user, { isActive: true, limit: 1 }),
  ]);

  return {
    onlineCount,
    offlineCount,
    inactiveCount,
    feedbackToday,
    activeSurveysCount: activeSurveys.pagination.total,
    departmentsCount: departments.length,
    locationsCount: locations.pagination.total,
  };
}

/**
 * When `surveyId` is supplied, the assigned survey is a *derived* value
 * (never stored on Tablet — see docs/DATA_MODEL.md), so it cannot be
 * pushed into the initial Mongo filter the way departmentId/locationId/
 * status can. This resolves the full in-scope candidate set once (still a
 * single additional query, not one per tablet), narrows to matching
 * tablet ids in memory, then re-queries with normal pagination applied —
 * deliberately only paying this cost when a survey filter is actually
 * used.
 */
async function narrowToSurveyMatches(baseFilter, surveyId) {
  if (!isValidObjectId(surveyId)) {
    throw new ApiError(400, 'surveyId must be a valid id.', [
      { field: 'surveyId', message: 'Invalid survey id.' },
    ]);
  }

  const candidates = await Tablet.find(baseFilter).select('_id locationId departmentId');
  const assignedSurveyByTabletId = await resolveActiveSurveysForTablets(candidates);

  const matchingIds = candidates
    .filter((tablet) => assignedSurveyByTabletId.get(tablet._id.toString())?._id?.toString() === surveyId)
    .map((tablet) => tablet._id);

  return { _id: { $in: matchingIds } };
}

export async function listMonitoredTablets(
  user,
  {
    departmentId,
    locationId,
    status,
    surveyId,
    search,
    dateFrom,
    dateTo,
    sortBy = 'deviceName',
    sortDir = 'asc',
    page = 1,
    limit = 20,
  } = {},
) {
  const cutoffDate = await getOfflineCutoffDate();

  let filter = buildTabletScopeFilter(user, { departmentId, locationId });
  if (filter === null) {
    return { tablets: [], pagination: emptyPagination(limit) };
  }

  applyStatusFilter(filter, status, cutoffDate);

  // search/dateFrom/dateTo are always composed via a top-level $and array
  // rather than writing directly to `filter.lastSeen` — applyStatusFilter
  // above may have already set `filter.lastSeen` (status=online) or
  // `filter.$or` (status=offline); MongoDB ANDs top-level keys with $and
  // clauses correctly, so this never overwrites what applyStatusFilter set.
  const andConditions = [];

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    andConditions.push({ $or: [{ deviceName: regex }, { deviceCode: regex }] });
  }

  // dateFrom/dateTo filter on lastSeen (the "activity" dimension this
  // screen cares about — feedback-date filtering already exists on the
  // Feedback module and is intentionally not duplicated here).
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = new Date(dateFrom);
    if (dateTo) range.$lte = new Date(dateTo);
    andConditions.push({ lastSeen: range });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  if (surveyId) {
    filter = await narrowToSurveyMatches(filter, surveyId);
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  const sortableFields = { deviceName: 'deviceName', deviceCode: 'deviceCode', lastSeen: 'lastSeen' };
  const sortField = sortableFields[sortBy] || 'deviceName';
  const sortOrder = sortDir === 'desc' ? -1 : 1;

  const [tablets, total] = await Promise.all([
    Tablet.find(filter).select(TABLET_PROJECTION).sort({ [sortField]: sortOrder }).skip(skip).limit(limitNum),
    Tablet.countDocuments(filter),
  ]);

  const [assignedSurveyByTabletId, feedbackStatsByTabletId] = await Promise.all([
    resolveActiveSurveysForTablets(tablets),
    getFeedbackStatsForTablets(tablets.map((t) => t._id)),
  ]);

  const serialized = tablets.map((tablet) =>
    serializeTablet(tablet, {
      cutoffDate,
      assignedSurvey: assignedSurveyByTabletId.get(tablet._id.toString()),
      feedbackStats: feedbackStatsByTabletId.get(tablet._id.toString()),
    }),
  );

  return {
    tablets: serialized,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

/**
 * Authorization matches tabletService.getTabletById exactly (Super Admin:
 * any tablet; Department Head/Personnel: own department only, 403
 * otherwise) — re-implemented here (rather than imported) only so the
 * `-activationToken` projection can be applied at the query itself; the
 * scoping check below is intentionally identical.
 */
export async function getMonitoredTabletDetail(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Tablet not found.');
  }

  const tablet = await Tablet.findById(id).select(TABLET_PROJECTION);

  if (!tablet) {
    throw new ApiError(404, 'Tablet not found.');
  }

  if (!isGlobalReadRole(user.role)) {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    if (ownDepartmentId !== tablet.departmentId.toString()) {
      throw new ApiError(403, 'You do not have access to this tablet.');
    }
  }

  const [department, cutoffDate, assignedSurveyByTabletId, feedbackStatsByTabletId] = await Promise.all([
    Department.findById(tablet.departmentId).select('_id name'),
    getOfflineCutoffDate(),
    resolveActiveSurveysForTablets([tablet]),
    getFeedbackStatsForTablets([tablet._id]),
  ]);

  return {
    tablet: serializeTablet(tablet, {
      cutoffDate,
      assignedSurvey: assignedSurveyByTabletId.get(tablet._id.toString()),
      feedbackStats: feedbackStatsByTabletId.get(tablet._id.toString()),
    }),
    department: department ? { _id: department._id, name: department.name } : null,
  };
}
