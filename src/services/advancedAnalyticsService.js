import mongoose from 'mongoose';
import Department from '../models/Department.js';
import Personnel from '../models/Personnel.js';
import FeedbackSession from '../models/FeedbackSession.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import {
  buildReportFilter,
  getAverageRating,
  getRatingAveragesByField,
  getFeedbackByDepartment,
  getFeedbackByBuilding,
  getFeedbackByLocation,
  getFeedbackByPersonnel,
  getFeedbackByServiceType,
  getFeedbackByRespondentType,
  getFeedbackByMonth,
  getFeedbackTrend,
  getRatingDistribution,
  getServiceQualityAverages,
  getServiceQualityByDepartment,
  getServiceQualityByPersonnel,
  getServiceQualityByServiceType,
  getServiceQualityByRespondentType,
  getSatisfactionKpi,
  getPeakHours,
  getPeriodComparison,
  getRecentComments,
  getLowRatingPatterns,
  getRecentRatingTrend,
} from './analyticsService.js';

/**
 * V2.9 — Advanced Role-Specific Analytics (backend/docs/v2/
 * V2_9_ADVANCED_ANALYTICS.md). One consolidated endpoint
 * (`GET /api/v1/analytics/advanced`, same "one endpoint over several"
 * design Reports (P7.1, docs/DECISIONS.md) already established) whose
 * response *shape* itself is role-tiered — unlike Reports, where every
 * role receives the same shape at a different scope, V2.9 explicitly
 * requires three genuinely different views (Senior Leadership
 * institution-wide, Department/Office Head own-office, Employee/
 * Personnel personal) — so `roleView` discriminates which single `data`
 * shape is present rather than returning three mostly-empty blocks.
 *
 * Field-level shapes deliberately mirror `reportsService.js`'s existing
 * `feedbackByX` + `serviceQuality.byX` convention (kept as separate
 * count/rating arrays and category arrays, not server-side joined) so the
 * frontend can reuse the exact same join-on-id rendering logic Reports'
 * `ServiceTypeBreakdownTable`/`RespondentTypeBreakdownTable`/
 * `ServiceQualityHeatmapTable` already implement, rather than inventing a
 * second response convention.
 */

// V2.5's category boundary conversion (reportsService.js's own
// toApiServiceQuality), duplicated here rather than imported: it is a
// trivial 4-line internal-to-API key rename, and this file's response
// shape composition is otherwise independent of reportsService.js.
function toApiServiceQuality({ courtesy, clarity, waiting_time: waitingTime, overall }) {
  return { courtesy, clarity, waitingTime, overall };
}

function serviceQualityRowsToApi(rows, idField, nameField) {
  return rows.map((row) => ({
    [idField]: row[idField],
    [nameField]: row[nameField],
    ...(idField !== 'departmentId' && row.departmentId !== undefined ? { departmentId: row.departmentId } : {}),
    ...toApiServiceQuality(row),
  }));
}

function withAverageRating(rows, idField, ratingByIdMap) {
  return rows.map((row) => ({
    ...row,
    averageRating: ratingByIdMap.get(String(row[idField])) ?? null,
  }));
}

function buildOfficeRanking(departmentRows, ratingByDepartment) {
  const withRating = withAverageRating(departmentRows, 'departmentId', ratingByDepartment);
  const sorted = [...withRating].sort((a, b) => {
    if (a.averageRating === null && b.averageRating === null) return b.count - a.count;
    if (a.averageRating === null) return 1;
    if (b.averageRating === null) return -1;
    return b.averageRating - a.averageRating;
  });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

const CATEGORY_LABELS = { courtesy: 'Courtesy', clarity: 'Clarity', waitingTime: 'Waiting Time' };

/**
 * Deterministic numeric insights (backend/docs/v2/
 * V2_9_ADVANCED_ANALYTICS.md's "Deterministic Insights" section — "Numeric
 * insights do NOT require ML"). Every input is optional; each insight is
 * only added when its own source data actually supports a meaningful,
 * non-guessed statement — no insight is ever fabricated from partial data.
 */
function computeDeterministicInsights({ monthlyTrend, categoryAverages, periodComparison, recentRatingTrend } = {}) {
  const insights = [];

  if (monthlyTrend && monthlyTrend.length > 0) {
    const withData = monthlyTrend.filter((entry) => entry.count > 0);
    if (withData.length > 0) {
      const highest = withData.reduce((best, entry) => (entry.count > best.count ? entry : best), withData[0]);
      insights.push({
        type: 'highest_feedback_month',
        label: `${formatMonthLabel(highest.month)} had the highest feedback volume (${highest.count} response${highest.count === 1 ? '' : 's'}).`,
        value: highest,
      });
    }

    let streak = 1;
    let direction = null;
    for (let i = monthlyTrend.length - 1; i > 0; i -= 1) {
      const diff = monthlyTrend[i].count - monthlyTrend[i - 1].count;
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      if (i === monthlyTrend.length - 1) {
        direction = dir;
        if (dir === 'flat') break;
        streak = 2;
      } else if (dir === direction) {
        streak += 1;
      } else {
        break;
      }
    }
    if (direction && direction !== 'flat' && streak >= 2) {
      insights.push({
        type: 'consecutive_trend',
        label: `Feedback volume has been ${direction === 'up' ? 'increasing' : 'decreasing'} for ${streak} consecutive months.`,
        value: { direction, streak },
      });
    }
  }

  if (categoryAverages) {
    const entries = Object.entries(CATEGORY_LABELS)
      .map(([key, label]) => [key, label, categoryAverages[key]])
      .filter(([, , value]) => value !== null && value !== undefined);
    if (entries.length >= 2) {
      const best = entries.reduce((top, entry) => (entry[2] > top[2] ? entry : top));
      const worst = entries.reduce((bottom, entry) => (entry[2] < bottom[2] ? entry : bottom));
      if (best[0] !== worst[0]) {
        insights.push({
          type: 'best_category',
          label: `${best[1]} is the strongest service quality dimension (${best[2].toFixed(2)}).`,
          value: { category: best[0], average: best[2] },
        });
        insights.push({
          type: 'worst_category',
          label: `${worst[1]} is the weakest service quality dimension (${worst[2].toFixed(2)}).`,
          value: { category: worst[0], average: worst[2] },
        });
      }
    }
  }

  if (periodComparison?.percentageChange !== null && periodComparison?.percentageChange !== undefined) {
    const pct = periodComparison.percentageChange;
    insights.push({
      type: 'percentage_change',
      label: `Feedback volume ${pct >= 0 ? 'increased' : 'decreased'} by ${Math.abs(pct)}% compared to the previous period.`,
      value: { percentageChange: pct },
    });
  }

  if (periodComparison?.ratingDelta !== null && periodComparison?.ratingDelta !== undefined) {
    const delta = periodComparison.ratingDelta;
    insights.push({
      type: 'current_vs_previous',
      label: `Average rating ${delta >= 0 ? 'improved' : 'declined'} by ${Math.abs(delta)} compared to the previous period.`,
      value: { ratingDelta: delta },
    });
  }

  if (recentRatingTrend?.direction) {
    const delta = Math.abs(recentRatingTrend.delta);
    const verb = recentRatingTrend.direction === 'up' ? 'increased' : recentRatingTrend.direction === 'down' ? 'decreased' : 'stayed the same';
    insights.push({
      type: 'recent_rating_trend',
      label: `Satisfaction ${verb}${recentRatingTrend.direction === 'flat' ? '' : ` by ${delta}`} over the last ${recentRatingTrend.sampleSize} responses.`,
      value: recentRatingTrend,
    });
  }

  return insights;
}

function assertValidObjectIdParam(value, field) {
  if (value && !isValidObjectId(value)) {
    throw new ApiError(400, `${field} must be a valid id.`, [{ field, message: `Invalid ${field}.` }]);
  }
}

function applyBuildingNarrowing(filter, buildingId) {
  if (filter === null || !buildingId) return filter;
  assertValidObjectIdParam(buildingId, 'buildingId');
  return { ...filter, buildingId: new mongoose.Types.ObjectId(buildingId) };
}

function emptyInstitutionData() {
  return {
    officeRanking: [],
    buildingPerformance: [],
    locationPerformance: [],
    serviceQualityHeatmap: [],
    monthlyTrend: [],
    ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0, percentage: 0 })),
    feedbackByServiceType: [],
    serviceQualityByServiceType: [],
    feedbackByRespondentType: [],
    serviceQualityByRespondentType: [],
    satisfactionKpi: { target: null, actual: null, variance: null, status: 'no_data', trend: { direction: null, previousActual: null } },
    peakHours: { byHour: [], byDayOfWeek: [], busiestHour: null, busiestDayOfWeek: null },
    periodComparison: { current: { averageRating: null, feedbackCount: 0 }, previous: { averageRating: null, feedbackCount: 0 }, percentageChange: null, ratingDelta: null },
  };
}

async function getInstitutionAnalytics(user, { departmentId, buildingId, dateFrom, dateTo, trendDays }) {
  let filter = buildReportFilter(user, { departmentId, dateFrom, dateTo });
  const resolvedFilters = {
    departmentId: filter?.departmentId ? filter.departmentId.toString() : null,
    buildingId: buildingId ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
  };

  if (filter === null) {
    return { roleView: 'institution', filters: resolvedFilters, data: emptyInstitutionData(), insights: [] };
  }

  filter = applyBuildingNarrowing(filter, buildingId);
  const trendDaysNum = trendDays !== undefined ? Number(trendDays) : undefined;

  const [
    feedbackByDepartmentBase,
    ratingByDepartment,
    feedbackByBuildingBase,
    ratingByBuilding,
    feedbackByLocationBase,
    ratingByLocation,
    serviceQualityByDepartmentBase,
    monthlyTrend,
    ratingDistribution,
    feedbackByServiceTypeBase,
    ratingByServiceType,
    serviceQualityByServiceTypeBase,
    feedbackByRespondentTypeBase,
    ratingByRespondentType,
    serviceQualityByRespondentTypeBase,
    satisfactionKpi,
    peakHours,
    periodComparison,
    categoryAverages,
  ] = await Promise.all([
    getFeedbackByDepartment(filter),
    getRatingAveragesByField(filter, 'session.departmentId'),
    getFeedbackByBuilding(filter),
    getRatingAveragesByField(filter, 'session.buildingId'),
    getFeedbackByLocation(filter),
    getRatingAveragesByField(filter, 'session.locationId'),
    getServiceQualityByDepartment(filter),
    getFeedbackByMonth(filter),
    getRatingDistribution(filter),
    getFeedbackByServiceType(filter),
    getRatingAveragesByField(filter, 'session.serviceTypeId'),
    getServiceQualityByServiceType(filter),
    getFeedbackByRespondentType(filter),
    getRatingAveragesByField(filter, 'session.respondentType'),
    getServiceQualityByRespondentType(filter),
    getSatisfactionKpi(filter, { departmentId: filter.departmentId, days: trendDaysNum, dateFrom, dateTo }),
    getPeakHours(filter),
    getPeriodComparison(filter, { days: trendDaysNum }),
    getServiceQualityAverages(filter),
  ]);

  const data = {
    officeRanking: buildOfficeRanking(feedbackByDepartmentBase, ratingByDepartment),
    buildingPerformance: withAverageRating(feedbackByBuildingBase, 'buildingId', ratingByBuilding),
    locationPerformance: withAverageRating(feedbackByLocationBase, 'locationId', ratingByLocation),
    serviceQualityHeatmap: serviceQualityRowsToApi(serviceQualityByDepartmentBase, 'departmentId', 'departmentName'),
    monthlyTrend,
    ratingDistribution,
    feedbackByServiceType: withAverageRating(feedbackByServiceTypeBase, 'serviceTypeId', ratingByServiceType),
    serviceQualityByServiceType: serviceQualityRowsToApi(serviceQualityByServiceTypeBase, 'serviceTypeId', 'serviceTypeName'),
    feedbackByRespondentType: withAverageRating(feedbackByRespondentTypeBase, 'respondentType', ratingByRespondentType),
    serviceQualityByRespondentType: serviceQualityRowsToApi(serviceQualityByRespondentTypeBase, 'respondentType', 'respondentTypeLabel'),
    satisfactionKpi,
    peakHours,
    periodComparison,
  };

  const insights = computeDeterministicInsights({
    monthlyTrend,
    categoryAverages: toApiServiceQuality(categoryAverages),
    periodComparison,
  });

  return { roleView: 'institution', filters: resolvedFilters, data, insights };
}

function emptyOfficeData() {
  return {
    departmentId: null,
    departmentName: null,
    serviceQuality: { courtesy: null, clarity: null, waitingTime: null, overall: null },
    buildingComparison: [],
    windowComparison: [],
    staffPerformance: [],
    staffServiceQuality: [],
    feedbackByServiceType: [],
    serviceQualityByServiceType: [],
    feedbackByRespondentType: [],
    serviceQualityByRespondentType: [],
    trend: [],
    recentComments: [],
    lowRatingPatterns: { lowRatingCount: 0, totalRatingCount: 0, lowRatingPercentage: 0, byLocation: [] },
  };
}

async function getOfficeAnalytics(user, { buildingId, dateFrom, dateTo, trendDays }) {
  let filter = buildReportFilter(user, { dateFrom, dateTo });
  const resolvedFilters = {
    departmentId: filter?.departmentId ? filter.departmentId.toString() : null,
    buildingId: buildingId ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
  };

  if (filter === null) {
    return { roleView: 'office', filters: resolvedFilters, data: emptyOfficeData(), insights: [] };
  }

  filter = applyBuildingNarrowing(filter, buildingId);
  const trendDaysNum = trendDays !== undefined ? Number(trendDays) : undefined;

  const [
    department,
    serviceQuality,
    buildingBase,
    ratingByBuilding,
    locationBase,
    ratingByLocation,
    staffBase,
    ratingByPersonnel,
    staffQualityBase,
    serviceTypeBase,
    ratingByServiceType,
    serviceQualityByServiceTypeBase,
    respondentBase,
    ratingByRespondentType,
    serviceQualityByRespondentTypeBase,
    trend,
    recentComments,
    lowRatingPatterns,
    monthlyTrend,
    periodComparison,
  ] = await Promise.all([
    Department.findById(filter.departmentId).select('_id name'),
    getServiceQualityAverages(filter),
    getFeedbackByBuilding(filter),
    getRatingAveragesByField(filter, 'session.buildingId'),
    getFeedbackByLocation(filter),
    getRatingAveragesByField(filter, 'session.locationId'),
    getFeedbackByPersonnel(filter),
    getRatingAveragesByField(filter, 'session.personnelId'),
    getServiceQualityByPersonnel(filter),
    getFeedbackByServiceType(filter),
    getRatingAveragesByField(filter, 'session.serviceTypeId'),
    getServiceQualityByServiceType(filter),
    getFeedbackByRespondentType(filter),
    getRatingAveragesByField(filter, 'session.respondentType'),
    getServiceQualityByRespondentType(filter),
    getFeedbackTrend(filter, { days: trendDaysNum, dateFrom, dateTo }),
    getRecentComments(filter, { limit: 20 }),
    getLowRatingPatterns(filter),
    getFeedbackByMonth(filter),
    getPeriodComparison(filter, { days: trendDaysNum }),
  ]);

  const apiServiceQuality = toApiServiceQuality(serviceQuality);

  const data = {
    departmentId: filter.departmentId.toString(),
    departmentName: department?.name ?? 'Unknown Department',
    serviceQuality: apiServiceQuality,
    buildingComparison: withAverageRating(buildingBase, 'buildingId', ratingByBuilding),
    windowComparison: withAverageRating(locationBase, 'locationId', ratingByLocation),
    staffPerformance: withAverageRating(staffBase, 'personnelId', ratingByPersonnel),
    staffServiceQuality: serviceQualityRowsToApi(staffQualityBase, 'personnelId', 'personnelName'),
    feedbackByServiceType: withAverageRating(serviceTypeBase, 'serviceTypeId', ratingByServiceType),
    serviceQualityByServiceType: serviceQualityRowsToApi(serviceQualityByServiceTypeBase, 'serviceTypeId', 'serviceTypeName'),
    feedbackByRespondentType: withAverageRating(respondentBase, 'respondentType', ratingByRespondentType),
    serviceQualityByRespondentType: serviceQualityRowsToApi(serviceQualityByRespondentTypeBase, 'respondentType', 'respondentTypeLabel'),
    trend,
    recentComments,
    lowRatingPatterns,
  };

  const insights = computeDeterministicInsights({ monthlyTrend, categoryAverages: apiServiceQuality, periodComparison });

  return { roleView: 'office', filters: resolvedFilters, data, insights };
}

function emptyPersonalData() {
  return {
    personnelId: null,
    fullName: null,
    hasAttributionData: false,
    averageRating: null,
    feedbackCount: 0,
    serviceQuality: { courtesy: null, clarity: null, waitingTime: null, overall: null },
    recentTrend: [],
    recentComments: [],
  };
}

async function getPersonalAnalytics(user, { dateFrom, dateTo, trendDays }) {
  const resolvedFilters = { departmentId: user.departmentId ? user.departmentId.toString() : null, buildingId: null, dateFrom: dateFrom ?? null, dateTo: dateTo ?? null };

  const personnel = await Personnel.findOne({ userId: user._id, isActive: true }).select(
    '_id firstName middleName lastName suffix',
  );

  if (!personnel) {
    return { roleView: 'personal', filters: resolvedFilters, data: emptyPersonalData(), insights: [] };
  }

  const baseFilter = buildReportFilter(user, { dateFrom, dateTo });
  if (baseFilter === null) {
    return {
      roleView: 'personal',
      filters: resolvedFilters,
      data: { ...emptyPersonalData(), personnelId: personnel._id, fullName: personnel.fullName, hasAttributionData: true },
      insights: [],
    };
  }

  const personalFilter = { ...baseFilter, personnelId: personnel._id };
  const trendDaysNum = trendDays !== undefined ? Number(trendDays) : undefined;

  const [averageRating, feedbackCount, serviceQuality, recentTrend, recentRatingTrend, recentComments] = await Promise.all([
    getAverageRating(personalFilter),
    FeedbackSession.countDocuments(personalFilter),
    getServiceQualityAverages(personalFilter),
    getFeedbackTrend(personalFilter, { days: trendDaysNum, dateFrom, dateTo }),
    getRecentRatingTrend(personalFilter, { windowSize: 10 }),
    getRecentComments(personalFilter, { limit: 20 }),
  ]);

  const apiServiceQuality = toApiServiceQuality(serviceQuality);

  const data = {
    personnelId: personnel._id,
    fullName: personnel.fullName,
    hasAttributionData: true,
    averageRating,
    feedbackCount,
    serviceQuality: apiServiceQuality,
    recentTrend,
    recentComments,
  };

  const insights = computeDeterministicInsights({ categoryAverages: apiServiceQuality, recentRatingTrend });

  return { roleView: 'personal', filters: resolvedFilters, data, insights };
}

/**
 * Entry point for `GET /api/v1/analytics/advanced`. Role determines which
 * of the three tiers is returned — `super_admin`/`senior_leadership`
 * (global read roles, `isGlobalReadRole`) get `institution`,
 * `department_head` gets `office`, `personnel` gets `personal`. No
 * `authorizeRoles` allow-list is needed at the route layer (every
 * authenticated role reaches a valid view), matching Dashboard/Reports'
 * own "read-scoped, not role-gated" convention.
 */
export async function getAdvancedAnalytics(user, query = {}) {
  const { departmentId, buildingId, dateFrom, dateTo, trendDays } = query;

  if (isGlobalReadRole(user.role)) {
    return getInstitutionAnalytics(user, { departmentId, buildingId, dateFrom, dateTo, trendDays });
  }

  if (user.role === 'department_head') {
    return getOfficeAnalytics(user, { buildingId, dateFrom, dateTo, trendDays });
  }

  return getPersonalAnalytics(user, { dateFrom, dateTo, trendDays });
}
