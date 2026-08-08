import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  getLiveMonitoringSummary,
  listMonitoredTablets,
  getMonitoredTabletDetail,
} from '../services/liveMonitoringService.js';

export const getSummary = asyncHandler(async function getSummary(req, res) {
  const summary = await getLiveMonitoringSummary(req.user);

  return sendSuccess(res, {
    message: 'Live monitoring summary retrieved successfully.',
    data: { summary },
  });
});

export const getTabletMonitorList = asyncHandler(async function getTabletMonitorList(req, res) {
  const {
    departmentId,
    locationId,
    status,
    surveyId,
    search,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    page,
    limit,
  } = req.query;

  const { tablets, pagination } = await listMonitoredTablets(req.user, {
    departmentId,
    locationId,
    status,
    surveyId,
    search,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Monitored tablets retrieved successfully.',
    data: { tablets, pagination },
  });
});

export const getTabletMonitorDetail = asyncHandler(async function getTabletMonitorDetail(req, res) {
  const { tablet, department } = await getMonitoredTabletDetail(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Tablet monitoring detail retrieved successfully.',
    data: { tablet, department },
  });
});
