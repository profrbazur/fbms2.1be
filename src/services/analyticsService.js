import mongoose from 'mongoose';
import FeedbackSession from '../models/FeedbackSession.js';
import FeedbackAnswer from '../models/FeedbackAnswer.js';
import Department from '../models/Department.js';
import Survey from '../models/Survey.js';
import Location from '../models/Location.js';
import ServiceType from '../models/ServiceType.js';
import { RESPONDENT_TYPE_LABELS } from '../models/FeedbackSession.js';
import { SERVICE_QUALITY_CATEGORIES } from '../models/Question.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { parseFilterDate } from '../utils/parseFilterDate.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import { getOrganizationSettings } from './organizationService.js';

/**
 * Shared analytics building blocks for Dashboard (P7.0) and Reports
 * (P7.1) — extracted here per P7.1's explicit "inspect dashboardService
 * before adding new report aggregations... extract genuinely reusable
 * analytics logic into a shared backend analytics service rather than
 * copying it" instruction. Every function here is deliberately shaped to
 * accept an already-resolved FeedbackSession-style Mongo filter (built by
 * `buildFeedbackScopeFilter`/`buildReportFilter` below) rather than a
 * `user` object directly, so the exact same aggregation serves both a
 * simple department-only scope (Dashboard) and a fuller
 * department+location+survey+date-range scope (Reports) with no branching
 * inside the aggregation itself. See docs/DECISIONS.md.
 */

export const VALID_TREND_DAYS = [7, 30];
// A generous but finite cap on a custom Feedback Trend date range, so a
// caller cannot force a multi-year, day-by-day zero-filled series in one
// request — no scenario in this phase's UI needs more than a year.
export const MAX_TREND_RANGE_DAYS = 366;
// Same finite-range reasoning as MAX_TREND_RANGE_DAYS, one bucket size up
// — Dashboard's Monthly Feedback Breakdown (Issue 4, V2.1.1) spans from
// the earliest in-scope session's month through the current month, capped
// here so a multi-year-old dataset can't force an unbounded series.
export const MAX_MONTHLY_BREAKDOWN_MONTHS = 12;

/**
 * Same one-line department-scoping idiom already repeated identically in
 * tabletService/feedbackService/personnelService/locationService/
 * liveMonitoringService — the project's standard access-scope check.
 * `departmentId` is only ever honored for `super_admin` (an explicit
 * narrowing filter); Department Head/Personnel are always pinned to their
 * own `user.departmentId`, matching every other module's established
 * pattern — a client-supplied `departmentId` can never widen their scope.
 *
 * V2.1.1 bugfix: always returns a real `mongoose.Types.ObjectId`, never a
 * raw string. `Model.aggregate()` pipelines (unlike `.find()`/
 * `.countDocuments()`) receive no schema-based auto-casting, so a `$match`
 * comparing a query-string `departmentId` against a BSON ObjectId field
 * silently matched zero documents — this filter object feeds both kinds
 * of query (see every `getFeedbackBy*`/`getRatingDistribution`/
 * `getAverageRating` aggregation below), so it must already be the right
 * BSON type before either consumer sees it.
 */
export function buildFeedbackScopeFilter(user, { departmentId } = {}) {
  if (isGlobalReadRole(user.role)) {
    if (!departmentId) return {};
    if (!isValidObjectId(departmentId)) {
      throw new ApiError(400, 'departmentId must be a valid id.', [
        { field: 'departmentId', message: 'Invalid department id.' },
      ]);
    }
    return { departmentId: new mongoose.Types.ObjectId(departmentId) };
  }

  if (!user.departmentId) return null;
  return { departmentId: new mongoose.Types.ObjectId(user.departmentId) };
}

/**
 * Validates and builds a `submittedAt` range clause. Returns `null` when
 * neither bound is supplied (no date filtering applied). Rejects an
 * unparseable date (`parseFilterDate`) and a range where `dateFrom` is
 * after `dateTo` — both explicit "Validate date ranges" requirements.
 */
export function buildDateRangeFilter(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return null;

  const range = {};
  if (dateFrom) range.$gte = parseFilterDate(dateFrom, 'dateFrom');
  if (dateTo) range.$lte = parseFilterDate(dateTo, 'dateTo');

  if (range.$gte && range.$lte && range.$gte.getTime() > range.$lte.getTime()) {
    throw new ApiError(400, 'dateFrom must not be after dateTo.', [
      { field: 'dateFrom', message: 'dateFrom must not be after dateTo.' },
    ]);
  }

  return range;
}

/**
 * The full FeedbackSession-shaped filter Reports' aggregations run
 * against: department scope (`buildFeedbackScopeFilter`) plus optional
 * `locationId`/`surveyId`/date-range narrowing. Returns `null` when the
 * caller has no visible department (mirrors `buildFeedbackScopeFilter`),
 * signaling every dependent aggregation to short-circuit to an empty
 * result rather than run an unscoped query.
 */
export function buildReportFilter(user, { departmentId, locationId, surveyId, dateFrom, dateTo } = {}) {
  const scopeFilter = buildFeedbackScopeFilter(user, { departmentId });
  if (scopeFilter === null) return null;

  const filter = { ...scopeFilter };

  if (locationId) {
    if (!isValidObjectId(locationId)) {
      throw new ApiError(400, 'locationId must be a valid id.', [
        { field: 'locationId', message: 'Invalid location id.' },
      ]);
    }
    filter.locationId = new mongoose.Types.ObjectId(locationId);
  }

  if (surveyId) {
    if (!isValidObjectId(surveyId)) {
      throw new ApiError(400, 'surveyId must be a valid id.', [
        { field: 'surveyId', message: 'Invalid survey id.' },
      ]);
    }
    filter.surveyId = new mongoose.Types.ObjectId(surveyId);
  }

  const dateRange = buildDateRangeFilter(dateFrom, dateTo);
  if (dateRange) filter.submittedAt = dateRange;

  return filter;
}

/**
 * `$lookup`-joins FeedbackAnswer -> FeedbackSession (for scoping) rather
 * than two round trips, since FeedbackAnswer itself carries no
 * departmentId/locationId/surveyId. Returns `null` (not `0`) when no
 * rating answers exist yet in scope — "no data" and "average of zero" are
 * different facts the frontend must be able to tell apart.
 */
export async function getAverageRating(filter) {
  if (filter === null) return null;

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const [result] = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating' } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    { $group: { _id: null, averageRating: { $avg: '$answer' }, count: { $sum: 1 } } },
  ]);

  if (!result || result.count === 0) return null;

  return Math.round(result.averageRating * 100) / 100;
}

/**
 * Per-group average rating (department/survey/location), used by Reports
 * to enrich the count-only `getFeedbackBy*` results below without
 * changing their existing Dashboard-facing shape. `sessionField` is the
 * joined session's field to group by, e.g. `'session.departmentId'`.
 */
export async function getRatingAveragesByField(filter, sessionField) {
  if (filter === null) return new Map();

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const rows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating' } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    { $group: { _id: `$${sessionField}`, averageRating: { $avg: '$answer' } } },
  ]);

  // V2.6 — `sessionField` is not always a required field (e.g.
  // `session.serviceTypeId` is nullable); a `_id: null` group represents
  // every session with no value for that field at all, which is never a
  // meaningful lookup key here (every caller only ever looks up a real
  // id) and must be excluded rather than crash on `null.toString()`.
  return new Map(
    rows
      .filter((row) => row._id !== null)
      .map((row) => [row._id.toString(), Math.round(row.averageRating * 100) / 100]),
  );
}

/**
 * P8.0's System Settings "Default Trend Window" — replaces what used to
 * be a hardcoded `7` here, per that phase's explicit "these must become
 * the application's configuration source" instruction. Falls back to `7`
 * only if the stored value is somehow missing/invalid (defensive; the
 * schema's own `enum: [7, 30]` should make that unreachable in practice).
 * Reuses `getOrganizationSettings()` unchanged — the same singleton read
 * `liveMonitoringService.getOfflineCutoffDate` already performs on every
 * request, so this adds no new query *pattern*, only one more call to an
 * already-established one; see docs/DECISIONS.md (ADR-046) for why an
 * in-process cache was deliberately not added on top of it.
 */
async function getDefaultTrendWindowDays() {
  const settings = await getOrganizationSettings();
  return VALID_TREND_DAYS.includes(settings.defaultTrendWindowDays) ? settings.defaultTrendWindowDays : 7;
}

/**
 * Resolves the effective 7/30-day rolling window `getFeedbackTrend` falls
 * back to when no explicit custom date range is supplied. Extracted so
 * `applyDefaultAnalysisWindow` (Issue 3 fix, V2.1.1) can apply the exact
 * same window to Rating Distribution — both charts share one definition of
 * "the last N days" rather than two independently-computed ones drifting
 * apart.
 */
async function resolveRollingWindowDates(days) {
  const trendDays = VALID_TREND_DAYS.includes(days) ? days : await getDefaultTrendWindowDays();
  const endDate = new Date();
  endDate.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (trendDays - 1));
  return { startDate, endDate };
}

/**
 * Daily feedback-submission counts, gaps filled with 0 so a chart is a
 * continuous trend line rather than skipping days with no submissions.
 * Supports three modes (Reports' "Last 7 days / Last 30 days / Custom
 * date range" requirement): an explicit `dateFrom`+`dateTo` window (only
 * activated when BOTH are supplied — a single-sided bound has no natural
 * trend length, so a lone `dateFrom` or `dateTo` still narrows every
 * other report section via `filter` but silently falls back to the
 * `days` window here rather than erroring), or `days` (7/30, defaulting
 * to Settings' configured `defaultTrendWindowDays` — P8.0 — for anything
 * else).
 */
export async function getFeedbackTrend(filter, { days, dateFrom, dateTo } = {}) {
  if (filter === null) return [];

  let startDate;
  let endDate;

  if (dateFrom && dateTo) {
    startDate = parseFilterDate(dateFrom, 'dateFrom');
    startDate.setUTCHours(0, 0, 0, 0);
    endDate = parseFilterDate(dateTo, 'dateTo');
    endDate.setUTCHours(0, 0, 0, 0);

    if (startDate.getTime() > endDate.getTime()) {
      throw new ApiError(400, 'dateFrom must not be after dateTo.', [
        { field: 'dateFrom', message: 'dateFrom must not be after dateTo.' },
      ]);
    }

    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > MAX_TREND_RANGE_DAYS) {
      throw new ApiError(400, `Custom date range cannot exceed ${MAX_TREND_RANGE_DAYS} days.`, [
        { field: 'dateTo', message: `Range cannot exceed ${MAX_TREND_RANGE_DAYS} days.` },
      ]);
    }
  } else {
    ({ startDate, endDate } = await resolveRollingWindowDates(days));
  }

  const rangeEndExclusive = new Date(endDate);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

  const rows = await FeedbackSession.aggregate([
    { $match: { ...filter, submittedAt: { $gte: startDate, $lt: rangeEndExclusive } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
        count: { $sum: 1 },
      },
    },
  ]);

  const countByDate = new Map(rows.map((row) => [row._id, row.count]));

  const trend = [];
  const cursor = new Date(startDate);
  while (cursor.getTime() <= endDate.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    trend.push({ date: key, count: countByDate.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return trend;
}

/**
 * Issue 3 fix (V2.1.1): Reports' Overview tab pairs Feedback Trend with
 * Rating Distribution under one shared "Analysis Period" (7/30 days)
 * control — but Rating Distribution's own `filter` (built by
 * `buildReportFilter`) previously carried no date bound at all unless the
 * caller had already selected an explicit custom date range, so it always
 * showed all-time data regardless of the 7/30-day toggle, silently
 * inconsistent with whatever Feedback Trend was showing next to it.
 *
 * When the caller has *not* selected an explicit custom range (`dateFrom`/
 * `dateTo` both absent — the toggle's only visible state, matching the
 * frontend hiding it once a custom range is set), this applies the exact
 * same rolling window `getFeedbackTrend` falls back to. When a custom
 * range (full or single-sided) is already selected, `filter` already
 * carries that scoping via `buildReportFilter`/`buildDateRangeFilter`
 * (ADR-041's existing, deliberate semantics) and is returned unchanged —
 * this never overrides an explicit filter, only fills the "no date
 * scoping at all" gap.
 */
export async function applyDefaultAnalysisWindow(filter, { days, dateFrom, dateTo } = {}) {
  if (filter === null) return null;
  if (dateFrom || dateTo) return filter;

  const { startDate, endDate } = await resolveRollingWindowDates(days);
  const rangeEndExclusive = new Date(endDate);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

  return { ...filter, submittedAt: { $gte: startDate, $lt: rangeEndExclusive } };
}

/**
 * Counts and percentages for each of the five `rating`-type answer
 * values (1-5) — Reports' explicit "Use only rating question answers. Do
 * not infer ratings from text/yes-no answers" requirement. Always
 * returns all five buckets (0-filled), never a sparse list.
 */
export async function getRatingDistribution(filter) {
  const emptyBuckets = () => [1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0, percentage: 0 }));

  if (filter === null) return emptyBuckets();

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const rows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating' } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    { $group: { _id: '$answer', count: { $sum: 1 } } },
  ]);

  const countByRating = new Map(rows.map((row) => [row._id, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return [1, 2, 3, 4, 5].map((rating) => {
    const count = countByRating.get(rating) ?? 0;
    return {
      rating,
      count,
      percentage: total === 0 ? 0 : Math.round((count / total) * 10000) / 100,
    };
  });
}

/**
 * Feedback volume grouped by department. Count-only — matches Dashboard's
 * (P7.0) original shape exactly so `dashboardService.js`'s response
 * contract is unchanged by this refactor. Reports layers `averageRating`
 * on top via `getRatingAveragesByField` rather than this function growing
 * a second, richer shape.
 */
export async function getFeedbackByDepartment(filter) {
  if (filter === null) return [];

  const rows = await FeedbackSession.aggregate([
    { $match: filter },
    { $group: { _id: '$departmentId', count: { $sum: 1 } } },
  ]);

  if (rows.length === 0) return [];

  const departments = await Department.find({ _id: { $in: rows.map((row) => row._id) } }).select('_id name');
  const nameById = new Map(departments.map((department) => [department._id.toString(), department.name]));

  return rows
    .map((row) => ({
      departmentId: row._id,
      departmentName: nameById.get(row._id.toString()) ?? 'Unknown Department',
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Feedback volume grouped by survey. Global surveys naturally appear for
 * whichever department actually collected feedback against them — the
 * grouping key is `FeedbackSession.surveyId`, filtered by
 * `FeedbackSession.departmentId` (tablet-derived, ADR-028), never by the
 * survey's own `departmentId`. Count-only, same reasoning as
 * `getFeedbackByDepartment` above.
 */
export async function getFeedbackBySurvey(filter) {
  if (filter === null) return [];

  const rows = await FeedbackSession.aggregate([
    { $match: filter },
    { $group: { _id: '$surveyId', count: { $sum: 1 } } },
  ]);

  if (rows.length === 0) return [];

  const surveys = await Survey.find({ _id: { $in: rows.map((row) => row._id) } }).select('_id title');
  const titleById = new Map(surveys.map((survey) => [survey._id.toString(), survey.title]));

  return rows
    .map((row) => ({
      surveyId: row._id,
      surveyTitle: titleById.get(row._id.toString()) ?? 'Unknown Survey',
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Feedback volume grouped by location — new for Reports (P7.1), no
 * Dashboard equivalent. `departmentId` is taken via `$first` since a
 * given `locationId` always resolves to exactly one department (Location
 * itself has a fixed `departmentId` — see docs/DATA_MODEL.md), not an
 * aggregation choice.
 */
export async function getFeedbackByLocation(filter) {
  if (filter === null) return [];

  const rows = await FeedbackSession.aggregate([
    { $match: filter },
    { $group: { _id: '$locationId', departmentId: { $first: '$departmentId' }, count: { $sum: 1 } } },
  ]);

  if (rows.length === 0) return [];

  const locationIds = rows.map((row) => row._id);
  const departmentIds = [...new Set(rows.map((row) => row.departmentId.toString()))];

  const [locations, departments] = await Promise.all([
    Location.find({ _id: { $in: locationIds } }).select('_id name'),
    Department.find({ _id: { $in: departmentIds } }).select('_id name'),
  ]);

  const locationNameById = new Map(locations.map((location) => [location._id.toString(), location.name]));
  const departmentNameById = new Map(departments.map((department) => [department._id.toString(), department.name]));

  return rows
    .map((row) => ({
      locationId: row._id,
      locationName: locationNameById.get(row._id.toString()) ?? 'Unknown Location',
      departmentId: row.departmentId,
      departmentName: departmentNameById.get(row.departmentId.toString()) ?? 'Unknown Department',
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Monthly feedback-submission counts — Dashboard's Monthly Feedback
 * Breakdown (Issue 4, V2.1.1), the same zero-filled-gap idea
 * `getFeedbackTrend` applies daily, one bucket size up. Spans from the
 * earliest in-scope `FeedbackSession`'s month through the current month
 * (capped at `MAX_MONTHLY_BREAKDOWN_MONTHS`) — deliberately *not* a
 * hardcoded demo-specific date range, so it reflects whatever historical
 * data actually exists in scope and keeps working as real data accrues.
 * Returns `[]` (not a single zero-filled bucket) when no feedback exists
 * in scope yet, matching every other `getFeedbackBy*` empty-scope
 * convention here.
 */
export async function getFeedbackByMonth(filter) {
  if (filter === null) return [];

  const [earliest] = await FeedbackSession.aggregate([
    { $match: filter },
    { $sort: { submittedAt: 1 } },
    { $limit: 1 },
    { $project: { submittedAt: 1 } },
  ]);

  if (!earliest) return [];

  const now = new Date();
  const endMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  let startMonthStart = new Date(
    Date.UTC(earliest.submittedAt.getUTCFullYear(), earliest.submittedAt.getUTCMonth(), 1),
  );
  const earliestAllowedStart = new Date(endMonthStart);
  earliestAllowedStart.setUTCMonth(earliestAllowedStart.getUTCMonth() - (MAX_MONTHLY_BREAKDOWN_MONTHS - 1));
  if (startMonthStart.getTime() < earliestAllowedStart.getTime()) {
    startMonthStart = earliestAllowedStart;
  }

  const rangeEndExclusive = new Date(endMonthStart);
  rangeEndExclusive.setUTCMonth(rangeEndExclusive.getUTCMonth() + 1);

  const rows = await FeedbackSession.aggregate([
    { $match: { ...filter, submittedAt: { $gte: startMonthStart, $lt: rangeEndExclusive } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$submittedAt' } },
        count: { $sum: 1 },
      },
    },
  ]);

  const countByMonth = new Map(rows.map((row) => [row._id, row.count]));

  const months = [];
  const cursor = new Date(startMonthStart);
  while (cursor.getTime() <= endMonthStart.getTime()) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push({ month: key, count: countByMonth.get(key) ?? 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

/**
 * V2.5 — the three standardized management dimensions
 * (backend/docs/v2/V2_5_SERVICE_QUALITY.md): Courtesy, Clarity, Waiting
 * Time. `null` for a dimension with zero in-scope answers ("no data",
 * never averaged as 0 — same distinction `getAverageRating` already
 * makes). `overall` is the arithmetic mean of whichever dimensions
 * actually have data (not a count-weighted average across all answers —
 * matches the planning docs' own worked example: Courtesy 4.7 / Clarity
 * 4.5 / Waiting Time 3.6 → Overall 4.27, i.e. mean of the three
 * category averages), `null` only when every dimension is `null`.
 */
function emptyServiceQuality() {
  return Object.fromEntries([...SERVICE_QUALITY_CATEGORIES.map((category) => [category, null]), ['overall', null]]);
}

function computeOverallServiceQuality(categoryAverages) {
  const values = SERVICE_QUALITY_CATEGORIES.map((category) => categoryAverages[category]).filter(
    (value) => value !== null,
  );
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

/**
 * Institution/department-scoped Courtesy/Clarity/Waiting Time averages
 * (plus derived Overall). Reads `FeedbackAnswer.serviceQualityCategory`
 * — the historical snapshot taken at submission time (feedbackService.js)
 * — never the live `Question.serviceQualityCategory`, so a later Survey
 * edit can never retroactively change what an already-submitted answer
 * counted toward (see backend/docs/v2/V2_5_SERVICE_QUALITY.md's Data
 * Integrity requirement). An answer with no category mapping
 * (`serviceQualityCategory: null` — most rating questions, and every
 * non-rating question) is excluded by the `$in` match, never
 * misclassified into one of the three dimensions.
 */
export async function getServiceQualityAverages(filter) {
  if (filter === null) return emptyServiceQuality();

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const rows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating', serviceQualityCategory: { $in: SERVICE_QUALITY_CATEGORIES } } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    { $group: { _id: '$serviceQualityCategory', averageRating: { $avg: '$answer' } } },
  ]);

  const result = emptyServiceQuality();
  rows.forEach((row) => {
    result[row._id] = Math.round(row.averageRating * 100) / 100;
  });
  result.overall = computeOverallServiceQuality(result);

  return result;
}

/**
 * The primary V2.5 heatmap: Office/Department × Service Quality
 * Category. One row per department that has at least one in-scope,
 * categorized rating answer — a department with none simply doesn't
 * appear (matches `getFeedbackByDepartment`'s own "no rows, not
 * zero-filled rows" convention), so the frontend can distinguish "no
 * data yet" from "measured and it's low." Grouped by the *collecting*
 * `session.departmentId` (tablet-derived, ADR-028), never the Question's
 * own parent Survey department — identical reasoning to every other
 * FeedbackSession-scoped aggregation in this file.
 */
export async function getServiceQualityByDepartment(filter) {
  if (filter === null) return [];

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const rows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating', serviceQualityCategory: { $in: SERVICE_QUALITY_CATEGORIES } } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    {
      $group: {
        _id: { departmentId: '$session.departmentId', category: '$serviceQualityCategory' },
        averageRating: { $avg: '$answer' },
      },
    },
  ]);

  if (rows.length === 0) return [];

  const departmentIds = [...new Set(rows.map((row) => row._id.departmentId.toString()))];
  const departments = await Department.find({ _id: { $in: departmentIds } }).select('_id name');
  const nameById = new Map(departments.map((department) => [department._id.toString(), department.name]));

  const byDepartment = new Map();
  rows.forEach((row) => {
    const departmentId = row._id.departmentId.toString();
    if (!byDepartment.has(departmentId)) {
      byDepartment.set(departmentId, emptyServiceQuality());
    }
    byDepartment.get(departmentId)[row._id.category] = Math.round(row.averageRating * 100) / 100;
  });

  return [...byDepartment.entries()]
    .map(([departmentId, categories]) => ({
      departmentId,
      departmentName: nameById.get(departmentId) ?? 'Unknown Department',
      ...categories,
      overall: computeOverallServiceQuality(categories),
    }))
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName));
}

/**
 * V2.6 — feedback volume grouped by Service Type (backend/docs/v2/
 * V2_6_SERVICE_TYPES.md's "volume by service type" analytics
 * requirement). Only sessions that actually carry a serviceTypeId
 * snapshot are counted — a session with `serviceTypeId: null` (every
 * pre-V2.6 session, and every v1-submitted session) simply doesn't
 * contribute a row, matching getFeedbackByDepartment's own "no rows, not
 * zero-filled rows" convention. `Math.round` matches this file's other
 * averaging functions.
 */
export async function getFeedbackByServiceType(filter) {
  if (filter === null) return [];

  const rows = await FeedbackSession.aggregate([
    { $match: { ...filter, serviceTypeId: { $ne: null } } },
    { $group: { _id: '$serviceTypeId', count: { $sum: 1 } } },
  ]);

  if (rows.length === 0) return [];

  const serviceTypes = await ServiceType.find({ _id: { $in: rows.map((row) => row._id) } }).select(
    '_id name departmentId',
  );
  const serviceTypeById = new Map(serviceTypes.map((serviceType) => [serviceType._id.toString(), serviceType]));

  return rows
    .map((row) => {
      const serviceType = serviceTypeById.get(row._id.toString());
      return {
        serviceTypeId: row._id,
        serviceTypeName: serviceType?.name ?? 'Unknown Service Type',
        departmentId: serviceType?.departmentId ?? null,
        count: row.count,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * V2.6 — Service Type × Service Quality Category, the same shape as
 * `getServiceQualityByDepartment` above but grouped by
 * `session.serviceTypeId` instead of `session.departmentId` (backend/docs/v2/
 * V2_6_SERVICE_TYPES.md's "quality dimensions by service type" and
 * V2_6_SERVICE_TYPES_UI.md's "Courtesy/Clarity/Waiting Time by Service
 * Type" requirements). A rating answer whose session has no
 * serviceTypeId simply isn't grouped here — legacy/unattributed data
 * never appears as a misleading "Unknown Service Type" row.
 */
export async function getServiceQualityByServiceType(filter) {
  if (filter === null) return [];

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const rows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating', serviceQualityCategory: { $in: SERVICE_QUALITY_CATEGORIES } } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    { $match: { 'session.serviceTypeId': { $ne: null } } },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    {
      $group: {
        _id: { serviceTypeId: '$session.serviceTypeId', category: '$serviceQualityCategory' },
        averageRating: { $avg: '$answer' },
      },
    },
  ]);

  if (rows.length === 0) return [];

  const serviceTypeIds = [...new Set(rows.map((row) => row._id.serviceTypeId.toString()))];
  const serviceTypes = await ServiceType.find({ _id: { $in: serviceTypeIds } }).select('_id name departmentId');
  const serviceTypeById = new Map(serviceTypes.map((serviceType) => [serviceType._id.toString(), serviceType]));

  const byServiceType = new Map();
  rows.forEach((row) => {
    const serviceTypeId = row._id.serviceTypeId.toString();
    if (!byServiceType.has(serviceTypeId)) {
      byServiceType.set(serviceTypeId, emptyServiceQuality());
    }
    byServiceType.get(serviceTypeId)[row._id.category] = Math.round(row.averageRating * 100) / 100;
  });

  return [...byServiceType.entries()]
    .map(([serviceTypeId, categories]) => {
      const serviceType = serviceTypeById.get(serviceTypeId);
      return {
        serviceTypeId,
        serviceTypeName: serviceType?.name ?? 'Unknown Service Type',
        departmentId: serviceType?.departmentId ?? null,
        ...categories,
        overall: computeOverallServiceQuality(categories),
      };
    })
    .sort((a, b) => a.serviceTypeName.localeCompare(b.serviceTypeName));
}

/**
 * V2.7 — feedback volume grouped by Respondent Type (backend/docs/v2/
 * V2_7_RESPONDENT_TYPE.md's "volume by respondent type" requirement).
 * No database lookup needed (unlike getFeedbackByServiceType) —
 * RESPONDENT_TYPE_LABELS supplies the display label directly from the
 * fixed enum value. Only sessions that actually carry a respondentType
 * snapshot are counted; a session with respondentType: null (every
 * v1-submitted session, and any V2 session where the respondent skipped
 * the optional field) simply doesn't contribute a row, matching
 * getFeedbackByServiceType's own "no rows, not zero-filled rows"
 * convention.
 */
export async function getFeedbackByRespondentType(filter) {
  if (filter === null) return [];

  const rows = await FeedbackSession.aggregate([
    { $match: { ...filter, respondentType: { $ne: null } } },
    { $group: { _id: '$respondentType', count: { $sum: 1 } } },
  ]);

  return rows
    .map((row) => ({
      respondentType: row._id,
      respondentTypeLabel: RESPONDENT_TYPE_LABELS[row._id] ?? row._id,
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * V2.7 — Respondent Type × Service Quality Category, the same shape as
 * getServiceQualityByServiceType but grouped by `session.respondentType`
 * instead of `session.serviceTypeId` (backend/docs/v2/
 * V2_7_RESPONDENT_TYPE.md's "quality categories by respondent type"
 * requirement). A rating answer whose session has no respondentType
 * simply isn't grouped here.
 */
export async function getServiceQualityByRespondentType(filter) {
  if (filter === null) return [];

  const sessionMatch = Object.fromEntries(Object.entries(filter).map(([field, value]) => [`session.${field}`, value]));

  const rows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating', serviceQualityCategory: { $in: SERVICE_QUALITY_CATEGORIES } } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    { $match: { 'session.respondentType': { $ne: null } } },
    ...(Object.keys(sessionMatch).length > 0 ? [{ $match: sessionMatch }] : []),
    {
      $group: {
        _id: { respondentType: '$session.respondentType', category: '$serviceQualityCategory' },
        averageRating: { $avg: '$answer' },
      },
    },
  ]);

  if (rows.length === 0) return [];

  const byRespondentType = new Map();
  rows.forEach((row) => {
    const respondentType = row._id.respondentType;
    if (!byRespondentType.has(respondentType)) {
      byRespondentType.set(respondentType, emptyServiceQuality());
    }
    byRespondentType.get(respondentType)[row._id.category] = Math.round(row.averageRating * 100) / 100;
  });

  return [...byRespondentType.entries()]
    .map(([respondentType, categories]) => ({
      respondentType,
      respondentTypeLabel: RESPONDENT_TYPE_LABELS[respondentType] ?? respondentType,
      ...categories,
      overall: computeOverallServiceQuality(categories),
    }))
    .sort((a, b) => a.respondentTypeLabel.localeCompare(b.respondentTypeLabel));
}

/**
 * V2.7 — Service Type × Respondent Type cross-tab (backend/docs/v2/
 * V2_7_RESPONDENT_TYPE.md's "service type × respondent type" analytics
 * requirement). Both dimensions must be present on the same session — a
 * session missing either simply isn't grouped here, the same convention
 * getFeedbackByServiceType/getFeedbackByRespondentType each use
 * individually. Volume comes from FeedbackSession (one row per session,
 * regardless of how many rating answers it has); average rating is
 * computed separately via the same FeedbackAnswer join every other
 * average-rating aggregation in this file uses, then merged by the
 * compound key.
 */
export async function getFeedbackByServiceTypeAndRespondentType(filter) {
  if (filter === null) return [];

  const matchBoth = { ...filter, serviceTypeId: { $ne: null }, respondentType: { $ne: null } };

  const countRows = await FeedbackSession.aggregate([
    { $match: matchBoth },
    {
      $group: {
        _id: { serviceTypeId: '$serviceTypeId', respondentType: '$respondentType' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (countRows.length === 0) return [];

  const sessionMatch = Object.fromEntries(Object.entries(matchBoth).map(([field, value]) => [`session.${field}`, value]));

  const ratingRows = await FeedbackAnswer.aggregate([
    { $match: { questionType: 'rating' } },
    {
      $lookup: {
        from: 'feedbacksessions',
        localField: 'feedbackSessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    { $match: sessionMatch },
    {
      $group: {
        _id: { serviceTypeId: '$session.serviceTypeId', respondentType: '$session.respondentType' },
        averageRating: { $avg: '$answer' },
      },
    },
  ]);

  const ratingByKey = new Map(
    ratingRows.map((row) => [
      `${row._id.serviceTypeId.toString()}:${row._id.respondentType}`,
      Math.round(row.averageRating * 100) / 100,
    ]),
  );

  const serviceTypeIds = [...new Set(countRows.map((row) => row._id.serviceTypeId.toString()))];
  const serviceTypes = await ServiceType.find({ _id: { $in: serviceTypeIds } }).select('_id name departmentId');
  const serviceTypeById = new Map(serviceTypes.map((serviceType) => [serviceType._id.toString(), serviceType]));

  return countRows
    .map((row) => {
      const serviceTypeId = row._id.serviceTypeId.toString();
      const serviceType = serviceTypeById.get(serviceTypeId);
      const key = `${serviceTypeId}:${row._id.respondentType}`;
      return {
        serviceTypeId: row._id.serviceTypeId,
        serviceTypeName: serviceType?.name ?? 'Unknown Service Type',
        departmentId: serviceType?.departmentId ?? null,
        respondentType: row._id.respondentType,
        respondentTypeLabel: RESPONDENT_TYPE_LABELS[row._id.respondentType] ?? row._id.respondentType,
        count: row.count,
        averageRating: ratingByKey.get(key) ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);
}
