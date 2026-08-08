import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listTablets,
  getTabletById,
  createTablet,
  updateTablet,
  regenerateActivationToken,
} from '../services/tabletService.js';
import { recordAuditEvent, resolveLifecycleAction } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

export const getTabletList = asyncHandler(async function getTabletList(req, res) {
  const { departmentId, locationId, isActive, search, page, limit } = req.query;

  const { tablets, pagination } = await listTablets(req.user, {
    departmentId,
    locationId,
    isActive: parseBooleanQueryParam(isActive),
    search,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Tablets retrieved successfully.',
    data: { tablets, pagination },
  });
});

export const getTablet = asyncHandler(async function getTablet(req, res) {
  const tablet = await getTabletById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Tablet retrieved successfully.',
    data: { tablet },
  });
});

export const postTablet = asyncHandler(async function postTablet(req, res) {
  const tablet = await createTablet(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'tablet.create',
    entityType: 'tablet',
    entityId: tablet._id,
    entityLabel: tablet.deviceName,
    departmentId: tablet.departmentId,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Tablet created successfully.',
    data: { tablet },
  });
});

export const patchTablet = asyncHandler(async function patchTablet(req, res) {
  const previous = await getTabletById(req.user, req.params.id);
  const wasActive = previous.isActive;

  const tablet = await updateTablet(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: resolveLifecycleAction('tablet', wasActive, tablet.isActive),
    entityType: 'tablet',
    entityId: tablet._id,
    entityLabel: tablet.deviceName,
    departmentId: tablet.departmentId,
    // Field names only — never values. deviceCode/locationId etc. are
    // safe by nature, but this also guarantees activationToken (which
    // the validator already rejects as an unknown field, see
    // validateTablet.js) could never leak here even if that changed.
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Tablet updated successfully.',
    data: { tablet },
  });
});

export const postRegenerateToken = asyncHandler(async function postRegenerateToken(req, res) {
  const tablet = await regenerateActivationToken(req.params.id);

  // Per this phase's explicit instruction: record only that
  // regeneration occurred — never the old or new activationToken value.
  await recordAuditEvent({
    actor: req.user,
    action: 'tablet.regenerate_token',
    entityType: 'tablet',
    entityId: tablet._id,
    entityLabel: tablet.deviceName,
    departmentId: tablet.departmentId,
    metadata: { note: 'Activation token regenerated.' },
    req,
  });

  return sendSuccess(res, {
    message: 'Activation token regenerated successfully.',
    data: { tablet },
  });
});
