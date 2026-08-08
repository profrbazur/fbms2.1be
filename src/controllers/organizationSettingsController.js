import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from '../services/organizationService.js';
import { recordAuditEvent } from '../services/auditService.js';

export const getSettings = asyncHandler(async function getSettings(req, res) {
  const settings = await getOrganizationSettings();

  return sendSuccess(res, {
    message: 'Organization settings retrieved successfully.',
    data: { settings },
  });
});

export const updateSettings = asyncHandler(async function updateSettings(req, res) {
  const settings = await updateOrganizationSettings(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'settings.update',
    entityType: 'settings',
    entityLabel: 'Organization Settings',
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Organization settings updated successfully.',
    data: { settings },
  });
});
