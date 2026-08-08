import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import { uploadLogo } from '../../middleware/uploadLogo.js';
import { validateSettings } from '../../validators/validateSettings.js';
import { getSettings, updateSettings, uploadSettingsLogo } from '../../controllers/settingsController.js';

// Mounted at /api/v1/settings (P8.0). Backed by the exact same
// OrganizationSettings singleton /api/v1/organization already reads and
// writes (ADR-043) — GET is available to all three roles (Department
// Head/Personnel read-only); PATCH and the logo upload are Super Admin
// only. `POST /logo` is a dedicated action endpoint (mirroring the
// established Tablets/Surveys "action endpoint alongside CRUD" pattern —
// e.g. POST /tablets/:id/regenerate-token, POST /surveys/:id/publish)
// rather than a violation of this phase's "No POST" instruction for the
// settings resource itself — it mutates only the logo fields of the one
// existing singleton, never creates a second settings document
// (ADR-044).
const router = Router();

router.get('/', authenticate, getSettings);
router.patch('/', authenticate, authorizeRoles('super_admin'), validateSettings, updateSettings);
router.post('/logo', authenticate, authorizeRoles('super_admin'), uploadLogo, uploadSettingsLogo);

export default router;
