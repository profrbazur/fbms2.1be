import { ApiError } from '../utils/ApiError.js';
import { CODE_PATTERN } from '../utils/validationPatterns.js';

const ALLOWED_FIELDS = ['name', 'code', 'description', 'isActive', 'satisfactionTarget'];

function validateFieldTypes(body, errors) {
  if ('name' in body && (typeof body.name !== 'string' || !body.name.trim())) {
    errors.push({ field: 'name', message: 'name must be a non-empty string.' });
  }

  if ('code' in body) {
    if (typeof body.code !== 'string' || !body.code.trim()) {
      errors.push({ field: 'code', message: 'code must be a non-empty string.' });
    } else if (!CODE_PATTERN.test(body.code.trim())) {
      errors.push({
        field: 'code',
        message: 'code must be 2-20 letters, numbers, hyphens, or underscores.',
      });
    }
  }

  if ('description' in body && typeof body.description !== 'string') {
    errors.push({ field: 'description', message: 'description must be a string.' });
  }

  if ('isActive' in body && typeof body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive must be a boolean.' });
  }

  // V2.8 — optional per-department Satisfaction KPI target override.
  // `null` clears the override (falls back to the organization default);
  // any other non-1-5 value is rejected.
  if ('satisfactionTarget' in body) {
    const value = body.satisfactionTarget;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 5)) {
      errors.push({
        field: 'satisfactionTarget',
        message: 'satisfactionTarget must be a number between 1 and 5, or null to clear the override.',
      });
    }
  }
}

function validateUnknownFields(body, errors) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

export function validateDepartmentCreate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push({ field: 'name', message: 'name is required.' });
  }

  if (!body.code || typeof body.code !== 'string' || !body.code.trim()) {
    errors.push({ field: 'code', message: 'code is required.' });
  }

  validateFieldTypes(body, errors);

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

export function validateDepartmentUpdate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);
  validateFieldTypes(body, errors);

  if (Object.keys(body).length === 0) {
    errors.push({ field: 'body', message: 'At least one field is required.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}
