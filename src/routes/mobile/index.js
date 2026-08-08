import { Router } from 'express';
import { authenticateDevice } from '../../middleware/authenticateDevice.js';
import {
  validateActivate,
  validateHeartbeat,
  validateFeedbackSubmission,
  validateSync,
} from '../../validators/validateMobile.js';
import {
  postActivate,
  postHeartbeat,
  getConfig,
  getSurvey,
  postFeedback,
  postSync,
} from '../../controllers/mobileController.js';

// Mounted at /api/v1/mobile per docs/MOBILE_PROTOCOL.md (P5.1). A
// tablet is not a User: every route except /activate authenticates via
// the dedicated Device Secret scheme (authenticateDevice.js), never the
// staff JWT middleware (authenticate.js) — the two are deliberately
// separate authentication systems.
const router = Router();

router.post('/activate', validateActivate, postActivate);
router.post('/heartbeat', authenticateDevice, validateHeartbeat, postHeartbeat);
router.get('/config', authenticateDevice, getConfig);
router.get('/survey', authenticateDevice, getSurvey);
router.post('/feedback', authenticateDevice, validateFeedbackSubmission, postFeedback);
router.post('/sync', authenticateDevice, validateSync, postSync);

export default router;
