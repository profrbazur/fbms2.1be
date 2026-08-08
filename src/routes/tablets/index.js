import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import {
  validateTabletCreate,
  validateTabletUpdate,
} from '../../validators/validateTablet.js';
import {
  getTabletList,
  getTablet,
  postTablet,
  patchTablet,
  postRegenerateToken,
} from '../../controllers/tabletController.js';

// Mounted at /api/v1/tablets per docs/API_CONTRACT.md (P3.2). Read
// access (GET) is available to all three roles, scoped server-side for
// Department Head/Personnel; writes (POST/PATCH/regenerate-token) are
// super_admin only, matching the established Departments/Locations/
// Personnel authorization shape. No DELETE route exists — deactivation
// (isActive: false via PATCH) is the only lifecycle transition.
const router = Router();

router.get('/', authenticate, getTabletList);
router.get('/:id', authenticate, getTablet);
router.post('/', authenticate, authorizeRoles('super_admin'), validateTabletCreate, postTablet);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validateTabletUpdate,
  patchTablet,
);
router.post(
  '/:id/regenerate-token',
  authenticate,
  authorizeRoles('super_admin'),
  postRegenerateToken,
);

export default router;
