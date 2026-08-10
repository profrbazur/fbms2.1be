import { Router } from 'express';
import { authenticateDevice } from '../../middleware/authenticateDevice.js';
import {
  validateHeartbeat,
  validateFeedbackSubmission,
  validateSync,
  validateStaffLogin,
} from '../../validators/validateMobile.js';
import { postHeartbeat, getConfig, getSurvey, postSync } from '../../controllers/mobileController.js';
import {
  postStaffLogin,
  postStaffLogout,
  getStaffActive,
  postFeedbackV2,
} from '../../controllers/mobileControllerV2.js';

/**
 * Mounted at /api/v2/mobile (V2.4 — backend/docs/v2/
 * V2_API_VERSIONING.md's "breaking mobile workflow" clause). Device
 * activation (POST /mobile/activate) deliberately stays v1-only and is
 * NOT duplicated here: a tablet activates exactly once and the resulting
 * Device Secret authenticates against both API generations equally
 * (authenticateDevice checks Tablet.deviceSecretHash regardless of which
 * router invoked it) — there is nothing version-specific about
 * activation itself. /heartbeat, /config, and /survey are unchanged from
 * v1 and reused directly (same controller functions, no duplicated
 * business logic) so a v2 kiosk client never needs to call back into v1
 * for anything. /staff/* and /feedback are the only genuinely new/changed
 * behavior this version introduces.
 */
const router = Router();

router.use(authenticateDevice);

router.post('/heartbeat', validateHeartbeat, postHeartbeat);
router.get('/config', getConfig);
router.get('/survey', getSurvey);
router.post('/sync', validateSync, postSync);

router.post('/staff/login', validateStaffLogin, postStaffLogin);
router.post('/staff/logout', postStaffLogout);
router.get('/staff/active', getStaffActive);

router.post('/feedback', validateFeedbackSubmission, postFeedbackV2);

export default router;
