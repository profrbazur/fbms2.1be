import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getAdvancedAnalytics } from '../services/advancedAnalyticsService.js';

export const getAdvancedAnalyticsHandler = asyncHandler(async function getAdvancedAnalyticsHandler(req, res) {
  const { departmentId, buildingId, dateFrom, dateTo, trendDays } = req.query;

  const analytics = await getAdvancedAnalytics(req.user, {
    departmentId,
    buildingId,
    dateFrom,
    dateTo,
    trendDays,
  });

  return sendSuccess(res, {
    message: 'Advanced analytics retrieved successfully.',
    data: analytics,
  });
});
