import { getLiveMonitoringSummary } from './liveMonitoringService.js';
import { listPersonnel } from './personnelService.js';
import { listFeedbackSessions } from './feedbackService.js';
import { listSurveys } from './surveyService.js';
import {
  buildFeedbackScopeFilter,
  getAverageRating,
  getFeedbackTrend,
  getFeedbackByDepartment,
  getFeedbackBySurvey,
  getFeedbackByMonth,
} from './analyticsService.js';

const RECENT_FEEDBACK_LIMIT = 5;

/**
 * Every card/chart here is either a direct reuse of an existing,
 * already-tested, role-scoped service function (`getLiveMonitoringSummary`,
 * `listPersonnel`, `listFeedbackSessions`, `listSurveys` — read only their
 * `.pagination.total`/count fields, no new query), or one of the four
 * shared analyticsService.js aggregations (average rating, feedback
 * trend, feedback by department, feedback by survey) — extracted there in
 * P7.1 when Reports needed the identical logic a second time (see
 * docs/DECISIONS.md); this call site and its response shape are
 * unchanged by that extraction. `tabletsCount`/
 * `surveyStatusDistribution.published` are pure arithmetic on
 * already-fetched values, not new queries. No `POST`/`PATCH`/`DELETE`
 * exists anywhere in this module — strictly read-only, matching this
 * phase's "operational summary only" objective.
 *
 * V2.1.1 (Issue 4): `charts.feedbackByMonth` is a new, purely additive
 * field (no existing field removed, renamed, or retyped — see ADR-051's
 * "bug fixes/additive changes remain permitted" carve-out) — Monthly
 * Feedback Breakdown, scoped by the same `scopeFilter` as every other
 * chart here (system-wide for Super Admin, department-pinned otherwise).
 */
export async function getDashboardSummary(user, { trendDays } = {}) {
  const scopeFilter = buildFeedbackScopeFilter(user);

  const [
    liveMonitoring,
    personnel,
    feedbackTotal,
    draftSurveys,
    archivedSurveys,
    averageRating,
    feedbackTrend,
    feedbackByDepartment,
    feedbackBySurvey,
    feedbackByMonth,
    recent,
  ] = await Promise.all([
    getLiveMonitoringSummary(user),
    listPersonnel(user, { limit: 1 }),
    listFeedbackSessions(user, { limit: 1 }),
    listSurveys(user, { isPublished: false, isArchived: false, limit: 1 }),
    listSurveys(user, { isArchived: true, limit: 1 }),
    getAverageRating(scopeFilter),
    getFeedbackTrend(scopeFilter, { days: trendDays }),
    getFeedbackByDepartment(scopeFilter),
    getFeedbackBySurvey(scopeFilter),
    getFeedbackByMonth(scopeFilter),
    listFeedbackSessions(user, { limit: RECENT_FEEDBACK_LIMIT }),
  ]);

  return {
    cards: {
      departmentsCount: liveMonitoring.departmentsCount,
      locationsCount: liveMonitoring.locationsCount,
      personnelCount: personnel.pagination.total,
      tabletsCount: liveMonitoring.onlineCount + liveMonitoring.offlineCount + liveMonitoring.inactiveCount,
      onlineTabletsCount: liveMonitoring.onlineCount,
      offlineTabletsCount: liveMonitoring.offlineCount,
      activeSurveysCount: liveMonitoring.activeSurveysCount,
      feedbackToday: liveMonitoring.feedbackToday,
      totalFeedback: feedbackTotal.pagination.total,
      averageRating,
    },
    charts: {
      feedbackTrend,
      feedbackByDepartment,
      feedbackBySurvey,
      feedbackByMonth,
      tabletStatusDistribution: {
        online: liveMonitoring.onlineCount,
        offline: liveMonitoring.offlineCount,
        inactive: liveMonitoring.inactiveCount,
      },
      surveyStatusDistribution: {
        draft: draftSurveys.pagination.total,
        published: liveMonitoring.activeSurveysCount,
        archived: archivedSurveys.pagination.total,
      },
    },
    recentFeedback: recent.feedbackSessions,
  };
}
