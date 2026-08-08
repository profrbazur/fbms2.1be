import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { CODE_PATTERN as DEVICE_CODE_PATTERN } from '../utils/validationPatterns.js';

// departmentId, activationToken, and lastSeen are deliberately absent —
// all three are server-derived/server-generated only (see
// tabletService.js and the Tablet model). Sending them is rejected by
// validateUnknownFields below, the same "unknown field" treatment used
// for every other write-protected field in this codebase.
const ALLOWED_FIELDS = [
  'deviceName',
  'deviceCode',
  'locationId',
  'serialNumber',
  'appVersion',
  'androidVersion',
  'notes',
  'isActive',
];

function validateUnknownFields(body, errors) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((field) => {
      errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
    });
}

function validateOptionalStringFields(body, errors) {
  ['serialNumber', 'appVersion', 'androidVersion', 'notes'].forEach((field) => {
    if (field in body && typeof body[field] !== 'string') {
      errors.push({ field, message: `${field} must be a string.` });
    }
  });
}

function validateSharedFields(body, errors) {
  if ('deviceName' in body && (typeof body.deviceName !== 'string' || !body.deviceName.trim())) {
    errors.push({ field: 'deviceName', message: 'deviceName must be a non-empty string.' });
  }

  if ('deviceCode' in body) {
    if (typeof body.deviceCode !== 'string' || !body.deviceCode.trim()) {
      errors.push({ field: 'deviceCode', message: 'deviceCode must be a non-empty string.' });
    } else if (!DEVICE_CODE_PATTERN.test(body.deviceCode.trim())) {
      errors.push({
        field: 'deviceCode',
        message: 'deviceCode must be 2-20 letters, numbers, hyphens, or underscores.',
      });
    }
  }

  if ('locationId' in body) {
    if (typeof body.locationId !== 'string' || !isValidObjectId(body.locationId)) {
      errors.push({ field: 'locationId', message: 'locationId must be a valid id.' });
    }
  }

  if ('isActive' in body && typeof body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive must be a boolean.' });
  }

  validateOptionalStringFields(body, errors);
}

export function validateTabletCreate(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  validateUnknownFields(body, errors);

  ['deviceName', 'deviceCode', 'locationId'].forEach((field) => {
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

export function validateTabletUpdate(req, res, next) {
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
