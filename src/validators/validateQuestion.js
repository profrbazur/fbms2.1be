import { ApiError } from '../utils/ApiError.js';
import { QUESTION_TYPES } from '../models/Question.js';

// surveyId is deliberately absent — it comes from the :id route param
// (POST /surveys/:id/questions), never the request body. Cross-field
// validation that depends on questionType (whether options are
// required/forbidden) lives in questionService.js's
// assertValidQuestionFields, since a stateless validator can't express
// "options required only when questionType is multiple_choice" as
// cleanly as a service function can.
const ALLOWED_FIELDS = ['questionText', 'questionType', 'required', 'order', 'options'];

function validateUnknownFields(body, errors) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

function validateSharedFields(body, errors) {
  if ('questionText' in body && (typeof body.questionText !== 'string' || !body.questionText.trim())) {
    errors.push({ field: 'questionText', message: 'questionText must be a non-empty string.' });
  }

  if ('questionType' in body && !QUESTION_TYPES.includes(body.questionType)) {
    errors.push({
      field: 'questionType',
      message: `questionType must be one of: ${QUESTION_TYPES.join(', ')}.`,
    });
  }

  if ('required' in body && typeof body.required !== 'boolean') {
    errors.push({ field: 'required', message: 'required must be a boolean.' });
  }

  if ('order' in body) {
    if (!Number.isInteger(body.order) || body.order < 1) {
      errors.push({ field: 'order', message: 'order must be a positive integer.' });
    }
  }

  if ('options' in body && !Array.isArray(body.options)) {
    errors.push({ field: 'options', message: 'options must be an array of strings.' });
  }
}

export function validateQuestionCreate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);

  ['questionText', 'questionType'].forEach((field) => {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      errors.push({ field, message: `${field} is required.` });
    }
  });

  validateSharedFields(body, errors);

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

export function validateQuestionUpdate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);
  validateSharedFields(body, errors);

  if (Object.keys(body).length === 0) {
    errors.push({ field: 'body', message: 'At least one field is required.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}
