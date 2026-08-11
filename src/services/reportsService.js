import FeedbackSession from '../models/FeedbackSession.js';
import Tablet from '../models/Tablet.js';
import Department from '../models/Department.js';
import Location from '../models/Location.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { listSurveys } from './surveyService.js';
import { getFeedbackStatsForTablets } from './liveMonitoringService.js';
import {
  buildFeedbackScopeFilter,
  buildReportFilter,
  applyDefaultAnalysisWindow,
  getAverageRating,
  getRatingAveragesByField,
  getFeedbackTrend,
  getRatingDistribution,
  getFeedbackByDepartment,
  getFeedbackBySurvey,
  getFeedbackByLocation,
  getFeedbackByServiceType,
  getFeedbackByRespondentType,
  getFeedbackByServiceTypeAndRespondentType,
  getServiceQualityAverages,
  getServiceQualityByDepartment,
  getServiceQualityByServiceType,
  getServiceQualityByRespondentType,
} from './analyticsService.js';

/**
 * V2.5 — API responses always use camelCase (`waitingTime`), while the
 * stored/internal category identifier stays the planning-doc-mandated
 * `waiting_time` (Question.serviceQualityCategory's enum value) — this
 * is the one boundary where the two representations meet.
 */
function toApiServiceQuality({ courtesy, clarity, waiting_time: waitingTime, overall }) {
  return { courtesy, clarity, waitingTime, overall };
}

function serviceQualityByDepartmentToApi(rows) {
  return rows.map(({ departmentId, departmentName, ...categories }) => ({
    departmentId,
    departmentName,
    ...toApiServiceQuality(categories),
  }));
}

// V2.6 — same category boundary conversion as serviceQualityByDepartmentToApi,
// applied to the Service Type × Category breakdown instead.
function serviceQualityByServiceTypeToApi(rows) {
  return rows.map(({ serviceTypeId, serviceTypeName, departmentId, ...categories }) => ({
    serviceTypeId,
    serviceTypeName,
    departmentId,
    ...toApiServiceQuality(categories),
  }));
}

// V2.7 — same category boundary conversion, applied to the Respondent
// Type × Category breakdown instead.
function serviceQualityByRespondentTypeToApi(rows) {
  return rows.map(({ respondentType, respondentTypeLabel, ...categories }) => ({
    respondentType,
    respondentTypeLabel,
    ...toApiServiceQuality(categories),
  }));
}

// Version 1's survey/tablet counts are small (the seeder ships 3 surveys,
// 4 tablets); a flat 100-row cap on the underlying list queries (already
// each collection's own max page size — see surveyService.listSurveys/
// tabletService.listTablets) is more than sufficient to return every
// visible survey/tablet in one page for the Survey Performance/Tablet
// Contribution tables without introducing pagination into this report.
const REPORT_ENTITY_LIMIT = 100;

function emptyRatingBuckets() {
  return [1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0, percentage: 0 }));
}

function emptyFeedbackSummaryReport(filters) {
  return {
    filters,
    summary: {
      totalFeedback: 0,
      averageRating: null,
      feedbackToday: 0,
      feedbackThisWeek: 0,
      feedbackThisMonth: 0,
      activeSurveysCount: 0,
      activeTabletsCount: 0,
      departmentsRepresented: 0,
    },
    feedbackTrend: [],
    ratingDistribution: emptyRatingBuckets(),
    feedbackByDepartment: [],
    feedbackBySurvey: [],
    feedbackByLocation: [],
    feedbackByServiceType: [],
    feedbackByRespondentType: [],
    feedbackByServiceTypeAndRespondentType: [],
    surveyPerformance: [],
    tabletContribution: [],
    serviceQuality: {
      courtesy: null,
      clarity: null,
      waitingTime: null,
      overall: null,
      byDepartment: [],
      byServiceType: [],
      byRespondentType: [],
    },
  };
}

function assertValidObjectIdParam(value, field) {
  if (value && !isValidObjectId(value)) {
    throw new ApiError(400, `${field} must be a valid id.`, [{ field, message: `Invalid ${field}.` }]);
  }
}

/**
 * Merges a count-only `getFeedbackBy*` row (analyticsService.js) with its
 * matching average-rating Map entry, defaulting to `null` (never `0`)
 * when no rating answers exist for that row — same "no data" vs.
 * "average of zero" distinction `getAverageRating` itself applies.
 */
function withAverageRating(rows, idField, ratingByIdMap) {
  return rows.map((row) => ({
    ...row,
    averageRating: ratingByIdMap.get(row[idField].toString()) ?? null,
  }));
}

function resolveAssignmentType(survey) {
  if (survey.locationId) return 'Location';
  if (survey.departmentId) return 'Department';
  return 'Global';
}

/**
 * All surveys visible to `user` (reusing surveyService.listSurveys's own
 * already-tested department-visibility rules — Global + own department
 * for a scoped role, optional departmentId narrowing for Super Admin),
 * optionally narrowed to a single `surveyId`. Deliberately does not
 * filter by whether a survey has any feedback yet — Survey Performance is
 * an overview of every survey in scope, including ones with zero
 * responses so far.
 */
async function listVisibleSurveysForReport(user, { departmentId, surveyId }) {
  const { surveys } = await listSurveys(user, {
    departmentId,
    limit: REPORT_ENTITY_LIMIT,
    includeGlobal: true,
  });
  if (!surveyId) return surveys;

  assertValidObjectIdParam(surveyId, 'surveyId');
  return surveys.filter((survey) => survey._id.toString() === surveyId);
}

/**
 * All tablets visible to `user` (same department-scoping idiom as
 * tabletService.listTablets), optionally narrowed to one `locationId`.
 * Kept as a direct `Tablet.find` (rather than importing
 * tabletService.listTablets) since Reports needs every visible tablet in
 * one page, not tabletService's own paginated/searchable shape.
 */
async function listVisibleTabletsForReport(user, { departmentId, locationId }) {
  const scopeFilter = buildFeedbackScopeFilter(user, { departmentId });
  if (scopeFilter === null) return [];

  const filter = { ...scopeFilter };
  if (locationId) {
    assertValidObjectIdParam(locationId, 'locationId');
    filter.locationId = locationId;
  }

  return Tablet.find(filter).select('_id deviceName departmentId locationId').limit(REPORT_ENTITY_LIMIT);
}

/**
 * Tablet Contribution table: every visible tablet plus its feedback
 * count/last-feedback timestamp, batched via
 * liveMonitoringService.getFeedbackStatsForTablets (one aggregation, not
 * one query per tablet — this phase's "no N+1 queries" requirement).
 * `extraMatch` carries only the parts of the report's date-range/survey
 * filter that a tablet's own department/location scope doesn't already
 * imply, so a tablet contribution count still respects a selected survey
 * or date range.
 */
async function getTabletContribution(user, { departmentId, locationId }, extraMatch) {
  const tablets = await listVisibleTabletsForReport(user, { departmentId, locationId });
  if (tablets.length === 0) return [];

  const departmentIds = [...new Set(tablets.map((tablet) => tablet.departmentId.toString()))];
  const locationIds = [...new Set(tablets.map((tablet) => tablet.locationId.toString()))];

  const [statsByTabletId, departments, locations] = await Promise.all([
    getFeedbackStatsForTablets(tablets.map((tablet) => tablet._id), extraMatch),
    Department.find({ _id: { $in: departmentIds } }).select('_id name'),
    Location.find({ _id: { $in: locationIds } }).select('_id name'),
  ]);

  const departmentNameById = new Map(departments.map((department) => [department._id.toString(), department.name]));
  const locationNameById = new Map(locations.map((location) => [location._id.toString(), location.name]));

  return tablets
    .map((tablet) => {
      const stats = statsByTabletId.get(tablet._id.toString());
      return {
        tabletId: tablet._id,
        deviceName: tablet.deviceName,
        departmentId: tablet.departmentId,
        departmentName: departmentNameById.get(tablet.departmentId.toString()) ?? 'Unknown Department',
        locationId: tablet.locationId,
        locationName: locationNameById.get(tablet.locationId.toString()) ?? 'Unknown Location',
        feedbackCount: stats?.feedbackCount ?? 0,
        lastFeedbackAt: stats?.lastFeedbackAt ?? null,
      };
    })
    .sort((a, b) => b.feedbackCount - a.feedbackCount);
}

/**
 * Survey Performance table: every visible survey plus its feedback
 * count/average rating, sourced from the already-computed
 * `feedbackBySurveyBase`/`ratingBySurvey` results (no second feedback
 * query) so a survey with zero responses still appears with
 * `feedbackCount: 0` rather than being silently omitted.
 */
function buildSurveyPerformance(surveys, feedbackBySurveyBase, ratingBySurvey) {
  const countBySurveyId = new Map(feedbackBySurveyBase.map((row) => [row.surveyId.toString(), row.count]));

  return surveys
    .map((survey) => ({
      surveyId: survey._id,
      title: survey.title,
      assignmentType: resolveAssignmentType(survey),
      isPublished: survey.isPublished,
      feedbackCount: countBySurveyId.get(survey._id.toString()) ?? 0,
      averageRating: ratingBySurvey.get(survey._id.toString()) ?? null,
    }))
    .sort((a, b) => b.feedbackCount - a.feedbackCount);
}

/**
 * The single consolidated Reports endpoint (P7.1) —
 * `GET /api/v1/reports/feedback-summary`. Returns every Version 1 report
 * section (summary cards, feedback trend, rating distribution, feedback
 * by department/survey/location, survey performance, tablet contribution)
 * in one response, scoped identically to every other module (Super Admin
 * system-wide with optional departmentId/locationId/surveyId/date-range
 * narrowing; Department Head/Personnel always pinned to their own
 * department server-side) — see docs/DECISIONS.md for why one endpoint
 * was chosen over eight.
 */
export async function getFeedbackSummaryReport(user, query = {}) {
  const { departmentId, locationId, surveyId, dateFrom, dateTo, trendDays } = query;

  // Built once, validated up front (invalid ids/date ranges reject before
  // any query runs) and reused across every aggregation below.
  const filter = buildReportFilter(user, { departmentId, locationId, surveyId, dateFrom, dateTo });
  const resolvedFilters = {
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    departmentId: filter?.departmentId ? filter.departmentId.toString() : null,
    locationId: locationId ?? null,
    surveyId: surveyId ?? null,
  };

  if (filter === null) {
    return emptyFeedbackSummaryReport(resolvedFilters);
  }

  // Scope-only filter (department/location/survey, no date range) — used
  // by the three fixed calendar-window cards (Today/This Week/This
  // Month), which are always "as of now" regardless of whatever custom
  // date range the caller selected for the rest of the report, and by
  // the Feedback Trend's own days/dateFrom/dateTo windowing. See
  // docs/DECISIONS.md.
  const scopeOnlyFilter = buildReportFilter(user, { departmentId, locationId, surveyId });

  const trendDaysNum = trendDays !== undefined ? Number(trendDays) : undefined;

  // Issue 3 fix (V2.1.1): Rating Distribution shares the same 7/30-day
  // "Analysis Period" window as Feedback Trend when no explicit custom
  // date range is selected (see applyDefaultAnalysisWindow's own doc
  // comment) — resolved once, up front, since getRatingDistribution below
  // needs the already-resolved filter object, not a pending promise.
  const ratingDistributionFilter = await applyDefaultAnalysisWindow(filter, {
    days: trendDaysNum,
    dateFrom,
    dateTo,
  });

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
  const startOfMonth = new Date(Date.UTC(startOfToday.getUTCFullYear(), startOfToday.getUTCMonth(), 1));

  const [
    totalFeedback,
    averageRating,
    feedbackToday,
    feedbackThisWeek,
    feedbackThisMonth,
    activeSurveys,
    activeTabletsCount,
    feedbackTrend,
    ratingDistribution,
    feedbackByDepartmentBase,
    feedbackBySurveyBase,
    feedbackByLocationBase,
    feedbackByServiceTypeBase,
    feedbackByRespondentTypeBase,
    feedbackByServiceTypeAndRespondentType,
    ratingByDepartment,
    ratingBySurvey,
    ratingByLocation,
    ratingByServiceType,
    ratingByRespondentType,
    surveys,
    serviceQualityAverages,
    serviceQualityByDepartmentBase,
    serviceQualityByServiceTypeBase,
    serviceQualityByRespondentTypeBase,
  ] = await Promise.all([
    FeedbackSession.countDocuments(filter),
    getAverageRating(filter),
    FeedbackSession.countDocuments({ ...scopeOnlyFilter, submittedAt: { $gte: startOfToday } }),
    FeedbackSession.countDocuments({ ...scopeOnlyFilter, submittedAt: { $gte: startOfWeek } }),
    FeedbackSession.countDocuments({ ...scopeOnlyFilter, submittedAt: { $gte: startOfMonth } }),
    listSurveys(user, {
      departmentId,
      locationId,
      isPublished: true,
      isArchived: false,
      limit: 1,
      includeGlobal: true,
    }),
    Tablet.countDocuments({
      ...buildFeedbackScopeFilter(user, { departmentId }),
      ...(locationId ? { locationId } : {}),
      isActive: true,
    }),
    getFeedbackTrend(scopeOnlyFilter, { days: trendDaysNum, dateFrom, dateTo }),
    getRatingDistribution(ratingDistributionFilter),
    getFeedbackByDepartment(filter),
    getFeedbackBySurvey(filter),
    getFeedbackByLocation(filter),
    getFeedbackByServiceType(filter),
    getFeedbackByRespondentType(filter),
    getFeedbackByServiceTypeAndRespondentType(filter),
    getRatingAveragesByField(filter, 'session.departmentId'),
    getRatingAveragesByField(filter, 'session.surveyId'),
    getRatingAveragesByField(filter, 'session.locationId'),
    getRatingAveragesByField(filter, 'session.serviceTypeId'),
    getRatingAveragesByField(filter, 'session.respondentType'),
    listVisibleSurveysForReport(user, { departmentId, surveyId }),
    getServiceQualityAverages(filter),
    getServiceQualityByDepartment(filter),
    getServiceQualityByServiceType(filter),
    getServiceQualityByRespondentType(filter),
  ]);

  const tabletExtraMatch = {};
  if (filter.surveyId) tabletExtraMatch.surveyId = filter.surveyId;
  if (filter.submittedAt) tabletExtraMatch.submittedAt = filter.submittedAt;

  const tabletContribution = await getTabletContribution(user, { departmentId, locationId }, tabletExtraMatch);

  const feedbackByDepartment = withAverageRating(feedbackByDepartmentBase, 'departmentId', ratingByDepartment);
  const feedbackBySurvey = withAverageRating(feedbackBySurveyBase, 'surveyId', ratingBySurvey);
  const feedbackByLocation = withAverageRating(feedbackByLocationBase, 'locationId', ratingByLocation);
  const feedbackByServiceType = withAverageRating(feedbackByServiceTypeBase, 'serviceTypeId', ratingByServiceType);
  const feedbackByRespondentType = withAverageRating(feedbackByRespondentTypeBase, 'respondentType', ratingByRespondentType);

  return {
    filters: resolvedFilters,
    summary: {
      totalFeedback,
      averageRating,
      feedbackToday,
      feedbackThisWeek,
      feedbackThisMonth,
      activeSurveysCount: activeSurveys.pagination.total,
      activeTabletsCount,
      departmentsRepresented: feedbackByDepartment.length,
    },
    feedbackTrend,
    ratingDistribution,
    feedbackByDepartment,
    feedbackBySurvey,
    feedbackByLocation,
    // V2.6 — volume + average rating per Service Type (backend/docs/v2/
    // V2_6_SERVICE_TYPES.md's "volume by service type" requirement).
    // Empty for any scope with no serviceTypeId-attributed feedback yet
    // (e.g. before this phase's data existed), same "no rows" convention
    // as feedbackByDepartment.
    feedbackByServiceType,
    // V2.7 — volume + average rating per Respondent Type (backend/docs/v2/
    // V2_7_RESPONDENT_TYPE.md's "volume by respondent type" requirement).
    // Empty for any scope with no respondentType-attributed feedback yet
    // (every v1-only submission, and any V2 session where the respondent
    // skipped the optional field), same "no rows" convention as
    // feedbackByServiceType.
    feedbackByRespondentType,
    // V2.7 — the "service type × respondent type" cross-tab (same
    // planning doc). Only sessions carrying both a serviceTypeId and a
    // respondentType snapshot contribute a row.
    feedbackByServiceTypeAndRespondentType,
    surveyPerformance: buildSurveyPerformance(surveys, feedbackBySurveyBase, ratingBySurvey),
    tabletContribution,
    // V2.5 — Courtesy/Clarity/Waiting Time/Overall, scoped identically to
    // every other section above (system-wide for Super Admin/Senior
    // Leadership, department-pinned otherwise). `byDepartment` is the
    // Office × Category heatmap — only meaningful as a cross-department
    // comparison, same "a scoped caller's response is always a single
    // trivial row" reasoning as feedbackByDepartment (the frontend hides
    // this table for Department Head/Personnel, mirroring that table's
    // own established convention). `byServiceType` (V2.6) is the same
    // idea, one row per Service Type that has at least one categorized
    // rating answer. `byRespondentType` (V2.7) is the same idea again,
    // one row per Respondent Type.
    serviceQuality: {
      ...toApiServiceQuality(serviceQualityAverages),
      byDepartment: serviceQualityByDepartmentToApi(serviceQualityByDepartmentBase),
      byServiceType: serviceQualityByServiceTypeToApi(serviceQualityByServiceTypeBase),
      byRespondentType: serviceQualityByRespondentTypeToApi(serviceQualityByRespondentTypeBase),
    },
  };
}
