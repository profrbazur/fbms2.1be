import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listLocations,
  getLocationById,
  createLocation,
  updateLocation,
} from '../services/locationService.js';
import { recordAuditEvent, resolveLifecycleAction } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

export const getLocations = asyncHandler(async function getLocations(req, res) {
  const { departmentId, buildingId, isActive, search, page, limit } = req.query;

  const { locations, pagination } = await listLocations(req.user, {
    departmentId,
    buildingId,
    isActive: parseBooleanQueryParam(isActive),
    search,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Locations retrieved successfully.',
    data: { locations, pagination },
  });
});

export const getLocation = asyncHandler(async function getLocation(req, res) {
  const location = await getLocationById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Location retrieved successfully.',
    data: { location },
  });
});

export const postLocation = asyncHandler(async function postLocation(req, res) {
  const location = await createLocation(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'location.create',
    entityType: 'location',
    entityId: location._id,
    entityLabel: location.name,
    departmentId: location.departmentId,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Location created successfully.',
    data: { location },
  });
});

export const patchLocation = asyncHandler(async function patchLocation(req, res) {
  const previous = await getLocationById(req.user, req.params.id);
  const wasActive = previous.isActive;

  const location = await updateLocation(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: resolveLifecycleAction('location', wasActive, location.isActive),
    entityType: 'location',
    entityId: location._id,
    entityLabel: location.name,
    departmentId: location.departmentId,
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Location updated successfully.',
    data: { location },
  });
});
