import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import { validateOrganizationSettings } from '../../validators/validateOrganizationSettings.js';
import { getSettings, updateSettings } from '../../controllers/organizationSettingsController.js';

// Mounted at /api/v1/organization per docs/API_CONTRACT.md. Lives in the
// organization/ route folder alongside departmentRoutes.js and
// locationRoutes.js per ADR-014/ADR-019 — one feature folder, several
// REST resource mount points.
const router = Router();

router.get('/', authenticate, getSettings);
router.patch(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  validateOrganizationSettings,
  updateSettings,
);

export default router;
