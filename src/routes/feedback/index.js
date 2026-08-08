import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getFeedbackList, getFeedbackDetail } from '../../controllers/feedbackController.js';

// Mounted at /api/v1/feedback per docs/API_CONTRACT.md (P5.0). Read-only
// by design — feedback is immutable (no POST/PATCH/DELETE anywhere in
// this module; submission belongs to a future Mobile API phase).
// Available to all three roles; Department Head/Personnel are always
// scoped server-side to their own departmentId (never widened by a
// supplied query parameter) — see feedbackService.js.
const router = Router();

router.get('/', authenticate, getFeedbackList);
router.get('/:id', authenticate, getFeedbackDetail);

export default router;
