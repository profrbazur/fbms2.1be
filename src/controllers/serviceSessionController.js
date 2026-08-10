import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { listServiceSessions, getServiceSessionById } from '../services/serviceSessionService.js';

export const getServiceSessionList = asyncHandler(async function getServiceSessionList(req, res) {
  const { departmentId, tabletId, personnelId, status, page, limit } = req.query;

  const { serviceSessions, pagination } = await listServiceSessions(req.user, {
    departmentId,
    tabletId,
    personnelId,
    status,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Service sessions retrieved successfully.',
    data: { serviceSessions, pagination },
  });
});

export const getServiceSession = asyncHandler(async function getServiceSession(req, res) {
  const serviceSession = await getServiceSessionById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Service session retrieved successfully.',
    data: { serviceSession },
  });
});
