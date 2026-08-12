import { Router } from 'express';
import { authenticateDevice } from '../../middleware/authenticateDevice.js';
import { staffPinRateLimiter } from '../../middleware/rateLimiter.js';
import {
  validateHeartbeat,
  validateFeedbackSubmissionV2,
  validateSync,
  validateStaffLogin,
} from '../../validators/validateMobile.js';
import { postHeartbeat, getConfig, getSurvey, postSync } from '../../controllers/mobileController.js';
import {
  postStaffLogin,
  postStaffLogout,
  getStaffActive,
  postFeedbackV2,
  getServiceTypesV2,
  getRespondentTypesV2,
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
 * for anything. /staff/*, /feedback, /service-types (V2.6), and
 * /respondent-types (V2.7) are the only genuinely new/changed behavior
 * this version introduces.
 */
const router = Router();

router.use(authenticateDevice);

router.post('/heartbeat', validateHeartbeat, postHeartbeat);
router.get('/config', getConfig);
router.get('/survey', getSurvey);
router.post('/sync', validateSync, postSync);

router.post('/staff/login', staffPinRateLimiter, validateStaffLogin, postStaffLogin);
router.post('/staff/logout', postStaffLogout);
router.get('/staff/active', getStaffActive);

// V2.6 — lets the kiosk client populate a Service Type picker with
// exactly the submitting tablet's own department's active options,
// without ever touching the admin-only, role-scoped /api/v1/service-types
// endpoint (see backend/docs/v2/V2_6_SERVICE_TYPES.md).
router.get('/service-types', getServiceTypesV2);

// V2.7 — lets the kiosk client populate an optional Respondent Type
// picker (backend/docs/v2/V2_7_RESPONDENT_TYPE.md). A fixed list, not
// department-scoped like /service-types above.
router.get('/respondent-types', getRespondentTypesV2);

router.post('/feedback', validateFeedbackSubmissionV2, postFeedbackV2);

export default router;
