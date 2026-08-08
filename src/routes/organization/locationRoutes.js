import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import {
  validateLocationCreate,
  validateLocationUpdate,
} from '../../validators/validateLocation.js';
import {
  getLocations,
  getLocation,
  postLocation,
  patchLocation,
} from '../../controllers/locationController.js';

// Mounted at /api/v1/locations per docs/API_CONTRACT.md. Lives in the
// organization/ route folder alongside departmentRoutes (index.js) and
// settingsRoutes.js per ADR-014/ADR-019.
const router = Router();

router.get('/', authenticate, getLocations);
router.get('/:id', authenticate, getLocation);
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  validateLocationCreate,
  postLocation,
);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validateLocationUpdate,
  patchLocation,
);

export default router;
