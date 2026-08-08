import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { reloadCanonicalDataset } from '../services/developerPortalService.js';
import { recordAuditEvent } from '../services/auditService.js';

export const postReloadCanonicalDataset = asyncHandler(async function postReloadCanonicalDataset(
  req,
  res,
) {
  const result = await reloadCanonicalDataset();

  await recordAuditEvent({
    actor: req.user,
    action: 'developerPortal.reload_canonical_dataset',
    entityType: 'developerPortal',
    entityLabel: 'Canonical Demonstration Dataset',
    metadata: result,
    req,
  });

  return sendSuccess(res, {
    message: 'Canonical demonstration dataset reloaded successfully.',
    data: result,
  });
});
