import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getSummary } from '../../controllers/dashboardController.js';

// Mounted at /api/v1/dashboard (P7.0). Strictly read-only, no
// POST/PATCH/DELETE anywhere in this module — an operational summary
// only. Available to all three roles; Department Head/Personnel receive
// department-scoped data (see dashboardService.js), matching the
// established pattern from Tablets/Feedback/Live Monitoring.
const router = Router();

router.get('/summary', authenticate, getSummary);

export default router;
