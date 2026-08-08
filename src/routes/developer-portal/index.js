import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import { postReloadCanonicalDataset } from '../../controllers/developerPortalController.js';

/**
 * Mounted at /api/v1/developer-portal (P9.2). A single administrative
 * action endpoint restoring FeedbackSession/FeedbackAnswer data to the
 * P9.1 Canonical Demonstration Dataset baseline — reuses
 * backend/src/seeders/loadCanonicalDataset.js's exact upsert logic
 * rather than reimplementing it, and never regenerates the dataset
 * (demo-data/generateCanonicalDataset.js is never called here). Super
 * Admin only. Purely additive under the Version 1 API freeze (ADR-051)
 * — no existing endpoint's contract changed.
 */
const router = Router();

router.post(
  '/reload-canonical-dataset',
  authenticate,
  authorizeRoles('super_admin'),
  postReloadCanonicalDataset,
);

export default router;
