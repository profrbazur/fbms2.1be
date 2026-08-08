import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getDashboardSummary } from '../services/dashboardService.js';

export const getSummary = asyncHandler(async function getSummary(req, res) {
  const trendDays = req.query.days !== undefined ? Number(req.query.days) : undefined;

  const summary = await getDashboardSummary(req.user, { trendDays });

  return sendSuccess(res, {
    message: 'Dashboard summary retrieved successfully.',
    data: summary,
  });
});
