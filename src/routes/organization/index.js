import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import {
  validateDepartmentCreate,
  validateDepartmentUpdate,
} from '../../validators/validateDepartment.js';
import {
  getDepartments,
  getDepartment,
  postDepartment,
  patchDepartment,
} from '../../controllers/departmentController.js';

// Mounted at /api/v1/departments per docs/API_CONTRACT.md and
// docs/DATA_MODEL.md's Department entity (P3.0).
const router = Router();

router.get('/', authenticate, getDepartments);
router.get('/:id', authenticate, getDepartment);
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  validateDepartmentCreate,
  postDepartment,
);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validateDepartmentUpdate,
  patchDepartment,
);

export default router;
