import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listPersonnel,
  getPersonnelById,
  createPersonnel,
  updatePersonnel,
  listLinkableUsers,
  regeneratePersonnelPin,
} from '../services/personnelService.js';
import { recordAuditEvent, resolveLifecycleAction } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

export const getPersonnelList = asyncHandler(async function getPersonnelList(req, res) {
  const { departmentId, isActive, search, page, limit, sortBy, sortOrder } = req.query;

  const { personnel, pagination } = await listPersonnel(req.user, {
    departmentId,
    isActive: parseBooleanQueryParam(isActive),
    search,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  return sendSuccess(res, {
    message: 'Personnel retrieved successfully.',
    data: { personnel, pagination },
  });
});

export const getPersonnel = asyncHandler(async function getPersonnel(req, res) {
  const personnel = await getPersonnelById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Personnel record retrieved successfully.',
    data: { personnel },
  });
});

export const postPersonnel = asyncHandler(async function postPersonnel(req, res) {
  const personnel = await createPersonnel(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'personnel.create',
    entityType: 'personnel',
    entityId: personnel._id,
    entityLabel: personnel.fullName || personnel.employeeNumber,
    departmentId: personnel.departmentId,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Personnel record created successfully.',
    data: { personnel },
  });
});

/**
 * A single PATCH can toggle isActive and/or the userId link at once —
 * link/unlink is the more security-relevant change (see
 * docs/PROJECT_SCOPE.md's Audit Logs scope), so it takes priority over
 * the generic activate/deactivate label when both happen together.
 */
function resolvePersonnelAction(req, previous, updated) {
  const isChangingUserId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'userId');
  const hadUserId = Boolean(previous.userId);
  const hasUserId = Boolean(updated.userId);

  if (isChangingUserId && hadUserId !== hasUserId) {
    return hasUserId ? 'personnel.link' : 'personnel.unlink';
  }

  return resolveLifecycleAction('personnel', previous.isActive, updated.isActive);
}

export const patchPersonnel = asyncHandler(async function patchPersonnel(req, res) {
  const previous = await getPersonnelById(req.user, req.params.id);

  const personnel = await updatePersonnel(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: resolvePersonnelAction(req, previous, personnel),
    entityType: 'personnel',
    entityId: personnel._id,
    entityLabel: personnel.fullName || personnel.employeeNumber,
    departmentId: personnel.departmentId,
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Personnel record updated successfully.',
    data: { personnel },
  });
});

// V2.4 — POST /api/v1/personnel/:id/regenerate-pin. Mirrors
// tabletController.postRegenerateToken's shape exactly: the plaintext PIN
// is returned in this one response only, and the audit trail records
// only that regeneration occurred, never the PIN value itself.
export const postRegeneratePin = asyncHandler(async function postRegeneratePin(req, res) {
  const { pin, personnel } = await regeneratePersonnelPin(req.params.id);

  await recordAuditEvent({
    actor: req.user,
    action: 'personnel.regenerate_pin',
    entityType: 'personnel',
    entityId: personnel._id,
    entityLabel: personnel.fullName || personnel.employeeNumber,
    departmentId: personnel.departmentId,
    metadata: { note: 'Staff PIN regenerated.' },
    req,
  });

  return sendSuccess(res, {
    message: 'Staff PIN regenerated successfully. Store this PIN securely — it will not be shown again.',
    data: { pin, personnel },
  });
});

export const getLinkableUsers = asyncHandler(async function getLinkableUsers(req, res) {
  const users = await listLinkableUsers();

  return sendSuccess(res, {
    message: 'Linkable users retrieved successfully.',
    data: { users },
  });
});
