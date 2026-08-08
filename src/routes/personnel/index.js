import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import {
  validatePersonnelCreate,
  validatePersonnelUpdate,
} from '../../validators/validatePersonnel.js';
import {
  getPersonnelList,
  getPersonnel,
  postPersonnel,
  patchPersonnel,
  getLinkableUsers,
} from '../../controllers/personnelController.js';

// Mounted at /api/v1/personnel per docs/API_CONTRACT.md (P3.1).
const router = Router();

// Must be registered before "/:id" — otherwise Express would match
// "linkable-users" as an :id value on the route below.
router.get('/linkable-users', authenticate, authorizeRoles('super_admin'), getLinkableUsers);

router.get('/', authenticate, getPersonnelList);
router.get('/:id', authenticate, getPersonnel);
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  validatePersonnelCreate,
  postPersonnel,
);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validatePersonnelUpdate,
  patchPersonnel,
);

export default router;
