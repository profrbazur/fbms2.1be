import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getFeedbackSummaryReport } from '../services/reportsService.js';

export const getFeedbackSummary = asyncHandler(async function getFeedbackSummary(req, res) {
  const { departmentId, locationId, surveyId, dateFrom, dateTo, trendDays } = req.query;

  const report = await getFeedbackSummaryReport(req.user, {
    departmentId,
    locationId,
    surveyId,
    dateFrom,
    dateTo,
    trendDays,
  });

  return sendSuccess(res, {
    message: 'Feedback summary report retrieved successfully.',
    data: report,
  });
});
