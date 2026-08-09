import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import {
  validateBuildingCreate,
  validateBuildingUpdate,
} from '../../validators/validateBuilding.js';
import {
  getBuildings,
  getBuilding,
  postBuilding,
  patchBuilding,
} from '../../controllers/buildingController.js';

// Mounted at /api/v1/buildings per docs/v2/V2_3_BUILDING_LOCATION.md.
// Lives in the organization/ route folder alongside departmentRoutes
// (index.js) and locationRoutes.js, per the same existing convention.
const router = Router();

router.get('/', authenticate, getBuildings);
router.get('/:id', authenticate, getBuilding);
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  validateBuildingCreate,
  postBuilding,
);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validateBuildingUpdate,
  patchBuilding,
);

export default router;
