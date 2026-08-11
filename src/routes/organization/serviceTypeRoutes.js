import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import {
  validateServiceTypeCreate,
  validateServiceTypeUpdate,
} from '../../validators/validateServiceType.js';
import {
  getServiceTypes,
  getServiceType,
  postServiceType,
  patchServiceType,
} from '../../controllers/serviceTypeController.js';

// Mounted at /api/v1/service-types (V2.6 — backend/docs/v2/V2_6_SERVICE_TYPES.md).
// Lives in the organization/ route folder alongside locationRoutes/buildingRoutes:
// a Service Type is Department/Office-owned master data, same category as those.
// Write access is Super Admin only, mirroring Location/Building's own restriction
// — planning does not grant Department Head management rights over Service Types.
const router = Router();

router.get('/', authenticate, getServiceTypes);
router.get('/:id', authenticate, getServiceType);
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  validateServiceTypeCreate,
  postServiceType,
);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validateServiceTypeUpdate,
  patchServiceType,
);

export default router;
