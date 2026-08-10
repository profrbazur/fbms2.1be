import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getServiceSessionList, getServiceSession } from '../../controllers/serviceSessionController.js';

// Mounted at /api/v1/service-sessions (V2.4). Read-only for every admin
// role — ServiceSession mutation belongs exclusively to the
// device-authenticated Staff PIN flow under /api/v2/mobile/staff/*.
const router = Router();

router.get('/', authenticate, getServiceSessionList);
router.get('/:id', authenticate, getServiceSession);

export default router;
