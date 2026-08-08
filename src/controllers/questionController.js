import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { updateQuestion } from '../services/questionService.js';
import { recordAuditEvent } from '../services/auditService.js';

const QUESTION_LABEL_MAX_LENGTH = 120;

function truncateLabel(text) {
  if (!text) return '';
  return text.length > QUESTION_LABEL_MAX_LENGTH
    ? `${text.slice(0, QUESTION_LABEL_MAX_LENGTH)}…`
    : text;
}

export const patchQuestion = asyncHandler(async function patchQuestion(req, res) {
  const question = await updateQuestion(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'question.update',
    entityType: 'question',
    entityId: question._id,
    entityLabel: truncateLabel(question.questionText),
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Question updated successfully.',
    data: { question },
  });
});
