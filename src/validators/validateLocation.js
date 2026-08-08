import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { CODE_PATTERN } from '../utils/validationPatterns.js';

const ALLOWED_FIELDS = ['name', 'code', 'description', 'departmentId', 'isActive'];

function validateUnknownFields(body, errors) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

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

  if ('departmentId' in body) {
    if (typeof body.departmentId !== 'string' || !isValidObjectId(body.departmentId)) {
      errors.push({ field: 'departmentId', message: 'departmentId must be a valid id.' });
    }
  }

  if ('isActive' in body && typeof body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive must be a boolean.' });
  }
}

export function validateLocationCreate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push({ field: 'name', message: 'name is required.' });
  }

  if (!body.code || typeof body.code !== 'string' || !body.code.trim()) {
    errors.push({ field: 'code', message: 'code is required.' });
  }

  if (!body.departmentId) {
    errors.push({ field: 'departmentId', message: 'departmentId is required.' });
  }

  validateFieldTypes(body, errors);

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}

export function validateLocationUpdate(req, res, next) {
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
