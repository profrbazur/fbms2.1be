import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import {
  getSummary,
  getTabletMonitorList,
  getTabletMonitorDetail,
} from '../../controllers/liveMonitoringController.js';

// Mounted at /api/v1/live-monitoring (P6.2). Strictly read-only — no
// POST/PATCH/DELETE exists anywhere in this module by design (this
// phase's own "READ-ONLY operational dashboard" objective). Available to
// all three roles; Department Head/Personnel are always scoped
// server-side to their own department, matching Tablets/Feedback's
// established pattern (see liveMonitoringService.js).
const router = Router();

router.get('/summary', authenticate, getSummary);
router.get('/tablets', authenticate, getTabletMonitorList);
router.get('/tablets/:id', authenticate, getTabletMonitorDetail);

export default router;
