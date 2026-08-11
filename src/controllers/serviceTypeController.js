import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listServiceTypes,
  getServiceTypeById,
  createServiceType,
  updateServiceType,
} from '../services/serviceTypeService.js';
import { recordAuditEvent, resolveLifecycleAction } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

export const getServiceTypes = asyncHandler(async function getServiceTypes(req, res) {
  const { departmentId, isActive, search, page, limit } = req.query;

  const { serviceTypes, pagination } = await listServiceTypes(req.user, {
    departmentId,
    isActive: parseBooleanQueryParam(isActive),
    search,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Service types retrieved successfully.',
    data: { serviceTypes, pagination },
  });
});

export const getServiceType = asyncHandler(async function getServiceType(req, res) {
  const serviceType = await getServiceTypeById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Service type retrieved successfully.',
    data: { serviceType },
  });
});

export const postServiceType = asyncHandler(async function postServiceType(req, res) {
  const serviceType = await createServiceType(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'serviceType.create',
    entityType: 'serviceType',
    entityId: serviceType._id,
    entityLabel: serviceType.name,
    departmentId: serviceType.departmentId,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Service type created successfully.',
    data: { serviceType },
  });
});

export const patchServiceType = asyncHandler(async function patchServiceType(req, res) {
  const previous = await getServiceTypeById(req.user, req.params.id);
  const wasActive = previous.isActive;

  const serviceType = await updateServiceType(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: resolveLifecycleAction('serviceType', wasActive, serviceType.isActive),
    entityType: 'serviceType',
    entityId: serviceType._id,
    entityLabel: serviceType.name,
    departmentId: serviceType.departmentId,
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Service type updated successfully.',
    data: { serviceType },
  });
});
