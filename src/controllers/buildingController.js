import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listBuildings,
  getBuildingById,
  createBuilding,
  updateBuilding,
} from '../services/buildingService.js';
import { recordAuditEvent, resolveLifecycleAction } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

export const getBuildings = asyncHandler(async function getBuildings(req, res) {
  const { isActive, search } = req.query;

  const buildings = await listBuildings(req.user, {
    isActive: parseBooleanQueryParam(isActive),
    search,
  });

  return sendSuccess(res, {
    message: 'Buildings retrieved successfully.',
    data: { buildings },
  });
});

export const getBuilding = asyncHandler(async function getBuilding(req, res) {
  const building = await getBuildingById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Building retrieved successfully.',
    data: { building },
  });
});

export const postBuilding = asyncHandler(async function postBuilding(req, res) {
  const building = await createBuilding(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'building.create',
    entityType: 'building',
    entityId: building._id,
    entityLabel: building.name,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Building created successfully.',
    data: { building },
  });
});

export const patchBuilding = asyncHandler(async function patchBuilding(req, res) {
  const previous = await getBuildingById(req.user, req.params.id);
  const wasActive = previous.isActive;

  const building = await updateBuilding(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: resolveLifecycleAction('building', wasActive, building.isActive),
    entityType: 'building',
    entityId: building._id,
    entityLabel: building.name,
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Building updated successfully.',
    data: { building },
  });
});
