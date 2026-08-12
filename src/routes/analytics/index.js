import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getAdvancedAnalyticsHandler } from '../../controllers/analyticsController.js';

// Mounted at /api/v1/analytics (V2.9 — backend/docs/v2/V2_9_ADVANCED_ANALYTICS.md).
// Strictly read-only, one consolidated endpoint (same "one endpoint over
// several" design as Reports, docs/DECISIONS.md) whose response shape is
// role-tiered rather than just role-scoped: Super Admin/Senior Leadership
// receive an institution-wide view, Department Head their own office, and
// Personnel their own individual attribution-based view. No
// `authorizeRoles` allow-list — every authenticated role resolves to a
// valid view server-side, matching Dashboard/Reports' own convention.
const router = Router();

router.get('/advanced', authenticate, getAdvancedAnalyticsHandler);

export default router;
