import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';

function rejectUnknownFields(body, allowedFields, errors) {
  Object.keys(body)
    .filter((key) => !allowedFields.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

// POST /api/v1/mobile/activate
export function validateActivate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  rejectUnknownFields(body, ['activationToken'], errors);

  if (typeof body.activationToken !== 'string' || !body.activationToken.trim()) {
    errors.push({ field: 'activationToken', message: 'activationToken is required.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

// POST /api/v1/mobile/heartbeat — deliberately only these two fields;
// no other tablet property is reachable through this endpoint (see
// "Do not allow arbitrary tablet updates").
const HEARTBEAT_FIELDS = ['appVersion', 'androidVersion'];

export function validateHeartbeat(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  rejectUnknownFields(body, HEARTBEAT_FIELDS, errors);

  HEARTBEAT_FIELDS.forEach((field) => {
    if (field in body && typeof body[field] !== 'string') {
      errors.push({ field, message: `${field} must be a string.` });
    }
  });

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

// POST /api/v1/mobile/feedback — departmentId/locationId are
// deliberately absent from ALLOWED_FIELDS: both are always derived from
// the authenticated tablet (see feedbackService.submitFeedback), never
// accepted from the client, so sending either is rejected the same as
// any other unknown field. V2.6 — serviceTypeId is deliberately absent
// here too: it is a v2-only concept (see FEEDBACK_FIELDS_V2 below),
// preserving v1's request contract exactly (backend/docs/v2/
// V2_API_VERSIONING.md's "Stable Student Contract").
const FEEDBACK_FIELDS = ['surveyId', 'submittedAt', 'completedAt', 'answers'];

// POST /api/v2/mobile/feedback (V2.6) — the only difference from v1's
// contract: serviceTypeId is additionally allowed and required, since
// the enhanced kiosk flow captures which service/transaction type the
// respondent is rating (backend/docs/v2/V2_6_SERVICE_TYPES.md). Its
// correctness (exists, active, correct department) is re-verified
// server-side in feedbackService.createFeedbackSession — this validator
// only checks shape.
const FEEDBACK_FIELDS_V2 = [...FEEDBACK_FIELDS, 'serviceTypeId'];

function validateFeedbackBody(body, allowedFields, { requireServiceType }) {
  const errors = [];

  rejectUnknownFields(body, allowedFields, errors);

  if (typeof body.surveyId !== 'string' || !isValidObjectId(body.surveyId)) {
    errors.push({ field: 'surveyId', message: 'surveyId must be a valid id.' });
  }

  ['submittedAt', 'completedAt'].forEach((field) => {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      errors.push({ field, message: `${field} is required and must be an ISO date string.` });
    }
  });

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    errors.push({ field: 'answers', message: 'answers must be a non-empty array.' });
  } else {
    body.answers.forEach((answer, index) => {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
        errors.push({ field: `answers[${index}]`, message: 'Each answer must be an object.' });
        return;
      }
      if (typeof answer.questionId !== 'string' || !isValidObjectId(answer.questionId)) {
        errors.push({ field: `answers[${index}].questionId`, message: 'questionId must be a valid id.' });
      }
      if (!('answer' in answer)) {
        errors.push({ field: `answers[${index}].answer`, message: 'answer is required.' });
      }
    });
  }

  if (requireServiceType) {
    if (typeof body.serviceTypeId !== 'string' || !isValidObjectId(body.serviceTypeId)) {
      errors.push({ field: 'serviceTypeId', message: 'serviceTypeId is required and must be a valid id.' });
    }
  }

  return errors;
}

export function validateFeedbackSubmission(req, res, next) {
  const errors = validateFeedbackBody(req.body ?? {}, FEEDBACK_FIELDS, { requireServiceType: false });

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

export function validateFeedbackSubmissionV2(req, res, next) {
  const errors = validateFeedbackBody(req.body ?? {}, FEEDBACK_FIELDS_V2, { requireServiceType: true });

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

// POST /api/v2/mobile/staff/login (V2.4) — the PIN is always exactly 6
// digits at input, per backend/docs/v2/V2_4_STAFF_PIN_SERVICE_SESSION.md.
// No other field is accepted: personnelId/departmentId etc. are always
// resolved server-side from the PIN match, never supplied by the client.
const PIN_PATTERN = /^\d{6}$/;

export function validateStaffLogin(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  rejectUnknownFields(body, ['pin'], errors);

  if (typeof body.pin !== 'string' || !PIN_PATTERN.test(body.pin)) {
    errors.push({ field: 'pin', message: 'pin must be exactly 6 digits.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

// POST /api/v1/mobile/sync — Version 1 implements only this stub
// contract (see docs/MOBILE_PROTOCOL.md); `pendingFeedback`, if
// supplied, must be an array, but its contents are not processed yet
// (no queue reconciliation in this phase).
export function validateSync(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  rejectUnknownFields(body, ['pendingFeedback'], errors);

  if ('pendingFeedback' in body && !Array.isArray(body.pendingFeedback)) {
    errors.push({ field: 'pendingFeedback', message: 'pendingFeedback must be an array.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}
