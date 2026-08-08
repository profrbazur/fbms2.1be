import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getFeedbackSummary } from '../../controllers/reportsController.js';

// Mounted at /api/v1/reports (P7.1). Strictly read-only — a single
// consolidated endpoint (see docs/DECISIONS.md for why one endpoint was
// chosen over several) returning every Version 1 report section in one
// response. Available to all three roles; Department Head/Personnel
// receive department-scoped data server-side, matching the established
// pattern from Dashboard/Feedback/Live Monitoring.
const router = Router();

router.get('/feedback-summary', authenticate, getFeedbackSummary);

export default router;
