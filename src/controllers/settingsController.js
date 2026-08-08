import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  getOrganizationSettings,
  updateOrganizationSettings,
  setOrganizationLogo,
} from '../services/organizationService.js';
import { recordAuditEvent } from '../services/auditService.js';

// Thin route-facing wrapper around the exact same singleton
// organizationService.js already owns (P8.0, ADR-043) — no duplicate
// retrieval/update logic exists here.
export const getSettings = asyncHandler(async function getSettings(req, res) {
  const settings = await getOrganizationSettings();

  return sendSuccess(res, {
    message: 'Settings retrieved successfully.',
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
    message: 'Settings updated successfully.',
    data: { settings },
  });
});

export const uploadSettingsLogo = asyncHandler(async function uploadSettingsLogo(req, res) {
  const settings = await setOrganizationLogo(req.file);

  await recordAuditEvent({
    actor: req.user,
    action: 'settings.logo_upload',
    entityType: 'settings',
    entityLabel: 'Organization Settings',
    metadata: { fileName: req.file?.originalname, mimeType: req.file?.mimetype },
    req,
  });

  return sendSuccess(res, {
    message: 'Logo uploaded successfully.',
    data: { settings },
  });
});
