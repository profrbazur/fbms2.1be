import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { CODE_PATTERN as EMPLOYEE_NUMBER_PATTERN, EMAIL_PATTERN } from '../utils/validationPatterns.js';

const ALLOWED_FIELDS = [
  'employeeNumber',
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'email',
  'contactNumber',
  'position',
  'departmentId',
  'userId',
  'isActive',
];

const CONTACT_NUMBER_PATTERN = /^[0-9+\-()\s]{7,20}$/;

function validateUnknownFields(body, errors) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

function validateOptionalStringFields(body, errors) {
  if ('middleName' in body && typeof body.middleName !== 'string') {
    errors.push({ field: 'middleName', message: 'middleName must be a string.' });
  }

  if ('suffix' in body && typeof body.suffix !== 'string') {
    errors.push({ field: 'suffix', message: 'suffix must be a string.' });
  }

  if ('contactNumber' in body && body.contactNumber) {
    if (typeof body.contactNumber !== 'string' || !CONTACT_NUMBER_PATTERN.test(body.contactNumber.trim())) {
      errors.push({
        field: 'contactNumber',
        message: 'contactNumber must be 7-20 digits, spaces, +, -, or parentheses.',
      });
    }
  }
}

function validateSharedFields(body, errors) {
  if ('employeeNumber' in body) {
    if (typeof body.employeeNumber !== 'string' || !body.employeeNumber.trim()) {
      errors.push({ field: 'employeeNumber', message: 'employeeNumber must be a non-empty string.' });
    } else if (!EMPLOYEE_NUMBER_PATTERN.test(body.employeeNumber.trim())) {
      errors.push({
        field: 'employeeNumber',
        message: 'employeeNumber must be 2-20 letters, numbers, hyphens, or underscores.',
      });
    }
  }

  if ('firstName' in body && (typeof body.firstName !== 'string' || !body.firstName.trim())) {
    errors.push({ field: 'firstName', message: 'firstName must be a non-empty string.' });
  }

  if ('lastName' in body && (typeof body.lastName !== 'string' || !body.lastName.trim())) {
    errors.push({ field: 'lastName', message: 'lastName must be a non-empty string.' });
  }

  if ('email' in body) {
    if (typeof body.email !== 'string' || !body.email.trim()) {
      errors.push({ field: 'email', message: 'email must be a non-empty string.' });
    } else if (!EMAIL_PATTERN.test(body.email.trim())) {
      errors.push({ field: 'email', message: 'email must be a valid email address.' });
    }
  }

  if ('position' in body && (typeof body.position !== 'string' || !body.position.trim())) {
    errors.push({ field: 'position', message: 'position must be a non-empty string.' });
  }

  if ('departmentId' in body) {
    if (typeof body.departmentId !== 'string' || !isValidObjectId(body.departmentId)) {
      errors.push({ field: 'departmentId', message: 'departmentId must be a valid id.' });
    }
  }

  if ('userId' in body && body.userId !== null) {
    if (typeof body.userId !== 'string' || !isValidObjectId(body.userId)) {
      errors.push({ field: 'userId', message: 'userId must be a valid id or null.' });
    }
  }

  if ('isActive' in body && typeof body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive must be a boolean.' });
  }

  validateOptionalStringFields(body, errors);
}

export function validatePersonnelCreate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);

  ['employeeNumber', 'firstName', 'lastName', 'email', 'position', 'departmentId'].forEach((field) => {
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

export function validatePersonnelUpdate(req, res, next) {
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
