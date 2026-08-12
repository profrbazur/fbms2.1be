import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getNotificationsHandler } from '../../controllers/notificationController.js';

// Mounted at /api/v1/notifications (V2.10 — backend/docs/v2/
// V2_FUTURE_ROADMAP.md). Strictly read-only, derived on every request —
// no Notification collection, no write endpoint anywhere in this module.
// `authenticate` only, no `authorizeRoles` allow-list — every authenticated
// role reaches a valid (possibly empty) result, matching Dashboard/
// Reports/Live Monitoring/Analytics' own "read-scoped, not role-gated"
// convention. Department/personal scoping is enforced entirely inside
// notificationService.js.
const router = Router();

router.get('/', authenticate, getNotificationsHandler);

export default router;
