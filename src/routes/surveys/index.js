import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorizeRoles.js';
import { validateSurveyCreate, validateSurveyUpdate } from '../../validators/validateSurvey.js';
import { validateQuestionCreate } from '../../validators/validateQuestion.js';
import {
  getSurveyList,
  getSurvey,
  postSurvey,
  patchSurvey,
  postPublishSurvey,
  postUnpublishSurvey,
  postArchiveSurvey,
  getSurveyQuestions,
  postSurveyQuestion,
} from '../../controllers/surveyController.js';

// Mounted at /api/v1/surveys per docs/API_CONTRACT.md (P4.0). Read
// access (GET) is available to all three roles, scoped server-side for
// Department Head/Personnel (Global + own department only — both are
// view-only per this phase's Authorization section); writes
// (POST/PATCH/publish/unpublish/archive/questions) are super_admin
// only. No DELETE route exists anywhere in this module.
const router = Router();

router.get('/', authenticate, getSurveyList);
router.get('/:id', authenticate, getSurvey);
router.post('/', authenticate, authorizeRoles('super_admin'), validateSurveyCreate, postSurvey);
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  validateSurveyUpdate,
  patchSurvey,
);
router.post('/:id/publish', authenticate, authorizeRoles('super_admin'), postPublishSurvey);
router.post('/:id/unpublish', authenticate, authorizeRoles('super_admin'), postUnpublishSurvey);
router.post('/:id/archive', authenticate, authorizeRoles('super_admin'), postArchiveSurvey);

router.get('/:id/questions', authenticate, getSurveyQuestions);
router.post(
  '/:id/questions',
  authenticate,
  authorizeRoles('super_admin'),
  validateQuestionCreate,
  postSurveyQuestion,
);

export default router;
