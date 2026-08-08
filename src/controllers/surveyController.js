import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
  publishSurvey,
  unpublishSurvey,
  archiveSurvey,
  listQuestionsForSurvey,
  createQuestionForSurvey,
} from '../services/surveyService.js';
import { recordAuditEvent } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

const QUESTION_LABEL_MAX_LENGTH = 120;

function truncateLabel(text) {
  if (!text) return '';
  return text.length > QUESTION_LABEL_MAX_LENGTH
    ? `${text.slice(0, QUESTION_LABEL_MAX_LENGTH)}…`
    : text;
}

export const getSurveyList = asyncHandler(async function getSurveyList(req, res) {
  const { departmentId, locationId, isPublished, isArchived, search, page, limit } = req.query;

  const { surveys, pagination } = await listSurveys(req.user, {
    departmentId,
    locationId,
    isPublished: parseBooleanQueryParam(isPublished),
    isArchived: parseBooleanQueryParam(isArchived),
    search,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Surveys retrieved successfully.',
    data: { surveys, pagination },
  });
});

export const getSurvey = asyncHandler(async function getSurvey(req, res) {
  const survey = await getSurveyById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Survey retrieved successfully.',
    data: { survey },
  });
});

export const postSurvey = asyncHandler(async function postSurvey(req, res) {
  const survey = await createSurvey(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'survey.create',
    entityType: 'survey',
    entityId: survey._id,
    entityLabel: survey.title,
    departmentId: survey.departmentId,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Survey created successfully.',
    data: { survey },
  });
});

export const patchSurvey = asyncHandler(async function patchSurvey(req, res) {
  const survey = await updateSurvey(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'survey.update',
    entityType: 'survey',
    entityId: survey._id,
    entityLabel: survey.title,
    departmentId: survey.departmentId,
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Survey updated successfully.',
    data: { survey },
  });
});

export const postPublishSurvey = asyncHandler(async function postPublishSurvey(req, res) {
  const survey = await publishSurvey(req.params.id);

  await recordAuditEvent({
    actor: req.user,
    action: 'survey.publish',
    entityType: 'survey',
    entityId: survey._id,
    entityLabel: survey.title,
    departmentId: survey.departmentId,
    req,
  });

  return sendSuccess(res, {
    message: 'Survey published successfully.',
    data: { survey },
  });
});

export const postUnpublishSurvey = asyncHandler(async function postUnpublishSurvey(req, res) {
  const survey = await unpublishSurvey(req.params.id);

  await recordAuditEvent({
    actor: req.user,
    action: 'survey.unpublish',
    entityType: 'survey',
    entityId: survey._id,
    entityLabel: survey.title,
    departmentId: survey.departmentId,
    req,
  });

  return sendSuccess(res, {
    message: 'Survey unpublished successfully.',
    data: { survey },
  });
});

export const postArchiveSurvey = asyncHandler(async function postArchiveSurvey(req, res) {
  const survey = await archiveSurvey(req.params.id);

  await recordAuditEvent({
    actor: req.user,
    action: 'survey.archive',
    entityType: 'survey',
    entityId: survey._id,
    entityLabel: survey.title,
    departmentId: survey.departmentId,
    req,
  });

  return sendSuccess(res, {
    message: 'Survey archived successfully.',
    data: { survey },
  });
});

export const getSurveyQuestions = asyncHandler(async function getSurveyQuestions(req, res) {
  const questions = await listQuestionsForSurvey(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Survey questions retrieved successfully.',
    data: { questions },
  });
});

export const postSurveyQuestion = asyncHandler(async function postSurveyQuestion(req, res) {
  const question = await createQuestionForSurvey(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'question.create',
    entityType: 'question',
    entityId: question._id,
    entityLabel: truncateLabel(question.questionText),
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Question created successfully.',
    data: { question },
  });
});
