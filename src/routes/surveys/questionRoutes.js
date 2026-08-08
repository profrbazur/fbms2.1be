import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import { validateQuestionUpdate } from '../../validators/validateQuestion.js';
import { patchQuestion } from '../../controllers/questionController.js';

// Mounted at /api/v1/questions per docs/API_CONTRACT.md (P4.0). A
// Question is addressed directly by its own id here (not nested under
// /surveys/:id) per this phase's explicit endpoint list. Lives in the
// surveys/ route folder alongside index.js per ADR-019's "multiple
// routers per folder when the feature owns multiple REST resources"
// pattern (Organization/Location did the same for a sibling resource).
const router = Router();

router.patch('/:id', authenticate, authorizeRoles('super_admin'), validateQuestionUpdate, patchQuestion);

export default router;
