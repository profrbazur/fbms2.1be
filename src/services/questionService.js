import Question from '../models/Question.js';
import Survey from '../models/Survey.js';
import { QUESTION_TYPES, SERVICE_QUALITY_CATEGORIES } from '../models/Question.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';

const MIN_MULTIPLE_CHOICE_OPTIONS = 2;

/**
 * V2.5 — cross-field validation depending on the sibling `questionType`
 * field, the same reasoning as `assertValidQuestionFields` above for
 * `options`. `null`/`undefined` always passes (not every question needs
 * a category, per backend/docs/v2/V2_5_SERVICE_QUALITY.md — free-text
 * comments and non-management rating questions are expected to stay
 * unmapped). Returns the normalized value to persist (`null` for
 * "no category").
 */
export function assertValidServiceQualityCategory({ questionType, serviceQualityCategory }) {
  if (serviceQualityCategory === undefined || serviceQualityCategory === null) {
    return null;
  }

  if (!SERVICE_QUALITY_CATEGORIES.includes(serviceQualityCategory)) {
    throw new ApiError(
      400,
      `serviceQualityCategory must be one of: ${SERVICE_QUALITY_CATEGORIES.join(', ')}, or null.`,
      [
        {
          field: 'serviceQualityCategory',
          message: `Must be one of: ${SERVICE_QUALITY_CATEGORIES.join(', ')}, or null.`,
        },
      ],
    );
  }

  if (questionType !== 'rating') {
    throw new ApiError(400, 'serviceQualityCategory is only allowed for rating questions.', [
      {
        field: 'serviceQualityCategory',
        message: 'serviceQualityCategory may only be set on a rating question.',
      },
    ]);
  }

  return serviceQualityCategory;
}

/**
 * Cross-field validation that depends on `questionType` (a sibling
 * field to `options`, so it can't be expressed in the stateless
 * validator middleware alone — see docs/CODING_STANDARDS.md's
 * "business rules belong in services" guidance). Returns the
 * normalized `options` array to persist (always `[]` for non-
 * multiple_choice types, even if the caller passed something else).
 */
export function assertValidQuestionFields({ questionType, options }) {
  if (questionType !== 'multiple_choice') {
    if (Array.isArray(options) && options.length > 0) {
      throw new ApiError(400, 'options are only allowed for multiple_choice questions.', [
        { field: 'options', message: 'options must be empty unless questionType is multiple_choice.' },
      ]);
    }
    return [];
  }

  if (!Array.isArray(options) || options.length < MIN_MULTIPLE_CHOICE_OPTIONS) {
    throw new ApiError(400, `multiple_choice questions require at least ${MIN_MULTIPLE_CHOICE_OPTIONS} options.`, [
      { field: 'options', message: `At least ${MIN_MULTIPLE_CHOICE_OPTIONS} options are required.` },
    ]);
  }

  const trimmed = options.map((option) => (typeof option === 'string' ? option.trim() : ''));

  if (trimmed.some((option) => !option)) {
    throw new ApiError(400, 'options must be non-empty strings.', [
      { field: 'options', message: 'Every option must be a non-empty string.' },
    ]);
  }

  if (new Set(trimmed.map((option) => option.toLowerCase())).size !== trimmed.length) {
    throw new ApiError(400, 'options must be unique.', [
      { field: 'options', message: 'Duplicate options are not allowed.' },
    ]);
  }

  return trimmed;
}

/**
 * Questions are never removed in Version 1 (no DELETE endpoint), so
 * appending at the end of the current order is always safe — no gap-
 * filling or renumbering logic is needed.
 */
export async function nextQuestionOrder(surveyId) {
  const last = await Question.findOne({ surveyId }).sort({ order: -1 }).select('order');
  return last ? last.order + 1 : 1;
}

/**
 * Duplicated (rather than imported from surveyService.js) to avoid a
 * circular import — surveyService.js already imports from this module
 * for question creation. The check itself is two lines and unlikely to
 * drift; see surveyService.js's own `assertSurveyEditable` for the
 * canonical survey-write version of the same rule.
 */
function assertParentSurveyEditable(survey) {
  if (survey.isArchived) {
    throw new ApiError(409, 'Archived surveys are read-only.');
  }
  if (survey.isPublished) {
    throw new ApiError(409, 'A published survey cannot be edited. Unpublish it first.');
  }
}

export async function updateQuestion(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Question not found.');
  }

  const question = await Question.findById(id);

  if (!question) {
    throw new ApiError(404, 'Question not found.');
  }

  const survey = await Survey.findById(question.surveyId);

  if (!survey) {
    throw new ApiError(404, 'Question not found.');
  }

  assertParentSurveyEditable(survey);

  const resultingType = updates.questionType !== undefined ? updates.questionType : question.questionType;

  if (updates.questionType !== undefined || updates.options !== undefined) {
    if (resultingType === 'multiple_choice') {
      // Validate against freshly-supplied options, or the question's
      // existing options if this request only changed other fields
      // (e.g. toggling `required` on an existing multiple_choice
      // question shouldn't force resending the same option list).
      const optionsToValidate = updates.options !== undefined ? updates.options : question.options;
      question.options = assertValidQuestionFields({
        questionType: 'multiple_choice',
        options: optionsToValidate,
      });
    } else if (updates.options !== undefined) {
      // The client explicitly sent options alongside a non-multiple_choice
      // type — a genuine client error, not stale leftover state.
      question.options = assertValidQuestionFields({ questionType: resultingType, options: updates.options });
    } else {
      // Switching away from multiple_choice without resending options:
      // the old options are no longer meaningful, so clear them rather
      // than rejecting a request that never mentioned options at all.
      question.options = [];
    }
  }

  // V2.5 — mirrors the options-handling block above exactly (same
  // sibling-field-depends-on-questionType reasoning).
  if (updates.questionType !== undefined || updates.serviceQualityCategory !== undefined) {
    if (resultingType === 'rating') {
      const categoryToValidate =
        updates.serviceQualityCategory !== undefined
          ? updates.serviceQualityCategory
          : question.serviceQualityCategory;
      question.serviceQualityCategory = assertValidServiceQualityCategory({
        questionType: 'rating',
        serviceQualityCategory: categoryToValidate,
      });
    } else if (updates.serviceQualityCategory !== undefined) {
      // The client explicitly sent a category alongside a non-rating
      // type — a genuine client error, not stale leftover state.
      question.serviceQualityCategory = assertValidServiceQualityCategory({
        questionType: resultingType,
        serviceQualityCategory: updates.serviceQualityCategory,
      });
    } else {
      // Switching away from rating without resending serviceQualityCategory:
      // no longer meaningful, clear it rather than leaving a stale value.
      question.serviceQualityCategory = null;
    }
  }

  if (updates.questionText !== undefined) question.questionText = updates.questionText.trim();
  if (updates.questionType !== undefined) question.questionType = updates.questionType;
  if (updates.required !== undefined) question.required = updates.required;
  if (updates.order !== undefined) question.order = updates.order;

  await question.save();

  return question;
}

export { QUESTION_TYPES };
