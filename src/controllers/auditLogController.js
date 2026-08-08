import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { listAuditLogs, getAuditLogById } from '../services/auditService.js';

export const getAuditLogList = asyncHandler(async function getAuditLogList(req, res) {
  const { search, actorUserId, action, entityType, departmentId, outcome, dateFrom, dateTo, page, limit } =
    req.query;

  const { auditLogs, pagination } = await listAuditLogs({
    search,
    actorUserId,
    action,
    entityType,
    departmentId,
    outcome,
    dateFrom,
    dateTo,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Audit logs retrieved successfully.',
    data: { auditLogs, pagination },
  });
});

export const getAuditLogDetail = asyncHandler(async function getAuditLogDetail(req, res) {
  const auditLog = await getAuditLogById(req.params.id);

  return sendSuccess(res, {
    message: 'Audit log entry retrieved successfully.',
    data: { auditLog },
  });
});
