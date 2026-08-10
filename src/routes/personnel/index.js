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
  postRegeneratePin,
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
// V2.4 — Staff PIN management is a Super Admin-only administrative
// action, deliberately separate from the general PATCH above (see
// backend/docs/v2/V2_4_STAFF_PIN_SERVICE_SESSION.md's "PIN hashes must
// never be exposed to the frontend" — this is the only endpoint that
// ever returns a plaintext PIN, and only once).
router.post(
  '/:id/regenerate-pin',
  authenticate,
  authorizeRoles('super_admin'),
  postRegeneratePin,
);

export default router;
