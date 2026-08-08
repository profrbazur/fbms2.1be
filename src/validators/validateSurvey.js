import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';

// isPublished, isArchived, publishedAt, and questionCount are
// deliberately absent — all four are server-managed only, via the
// publish/unpublish/archive endpoints and question creation, never a
// direct field on POST/PATCH /surveys. Sending them is rejected as an
// unknown field, same treatment as Tablet's departmentId/activationToken.
const ALLOWED_FIELDS = ['title', 'description', 'departmentId', 'locationId'];

function validateUnknownFields(body, errors) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

function validateSharedFields(body, errors) {
  if ('title' in body && (typeof body.title !== 'string' || !body.title.trim())) {
    errors.push({ field: 'title', message: 'title must be a non-empty string.' });
  }

  if ('description' in body && typeof body.description !== 'string') {
    errors.push({ field: 'description', message: 'description must be a string.' });
  }

  if ('departmentId' in body && body.departmentId !== null) {
    if (typeof body.departmentId !== 'string' || !isValidObjectId(body.departmentId)) {
      errors.push({ field: 'departmentId', message: 'departmentId must be a valid id or null.' });
    }
  }

  if ('locationId' in body && body.locationId !== null) {
    if (typeof body.locationId !== 'string' || !isValidObjectId(body.locationId)) {
      errors.push({ field: 'locationId', message: 'locationId must be a valid id or null.' });
    }
  }
}

export function validateSurveyCreate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    errors.push({ field: 'title', message: 'title is required.' });
  }

  validateSharedFields(body, errors);

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

export function validateSurveyUpdate(req, res, next) {
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
