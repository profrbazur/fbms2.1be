import { ApiError } from '../utils/ApiError.js';
import { EMAIL_PATTERN, HEX_COLOR_PATTERN } from '../utils/validationPatterns.js';

const ALLOWED_FIELDS = [
  'universityName',
  'address',
  'contactNumber',
  'email',
  'contactPerson',
  'primaryColor',
  'secondaryColor',
  'logoUrl',
  'mobileHeartbeatIntervalSeconds',
  'mobileMinAppVersion',
];

const REQUIRED_STRING_FIELDS = [
  'universityName',
  'address',
  'contactNumber',
  'email',
  'contactPerson',
  'primaryColor',
  'secondaryColor',
];

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * PATCH /api/v1/organization body validation. Every field is optional on
 * a given request (partial update), but any field that IS supplied must
 * be non-empty/well-formed, and unknown properties are rejected outright
 * rather than silently dropped — per this phase's "Do not allow
 * arbitrary properties" instruction.
 */
export function validateOrganizationSettings(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  const unknownFields = Object.keys(body).filter(
    (key) => !ALLOWED_FIELDS.includes(key),
  );
  unknownFields.forEach((field) => {
    errors.push({ field, message: `Unknown field "${field}" is not allowed.` });
  });

  REQUIRED_STRING_FIELDS.forEach((field) => {
    if (!(field in body)) return;
    const value = body[field];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push({ field, message: `${field} must be a non-empty string.` });
    }
  });

  if (typeof body.email === 'string' && body.email.trim() && !EMAIL_PATTERN.test(body.email.trim())) {
    errors.push({ field: 'email', message: 'Email must be a valid email address.' });
  }

  ['primaryColor', 'secondaryColor'].forEach((field) => {
    if (
      typeof body[field] === 'string' &&
      body[field].trim() &&
      !HEX_COLOR_PATTERN.test(body[field].trim())
    ) {
      errors.push({ field, message: `${field} must be a hex color (e.g. #002E1F).` });
    }
  });

  if ('logoUrl' in body) {
    const value = body.logoUrl;
    if (typeof value !== 'string') {
      errors.push({ field: 'logoUrl', message: 'logoUrl must be a string.' });
    } else if (value.trim() && !URL_PATTERN.test(value.trim())) {
      errors.push({ field: 'logoUrl', message: 'logoUrl must be a valid http(s) URL.' });
    }
  }

  // P5.1 — the only two settings GET /api/v1/mobile/config reads.
  if ('mobileHeartbeatIntervalSeconds' in body) {
    const value = body.mobileHeartbeatIntervalSeconds;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 30) {
      errors.push({
        field: 'mobileHeartbeatIntervalSeconds',
        message: 'mobileHeartbeatIntervalSeconds must be a number of at least 30 seconds.',
      });
    }
  }

  if ('mobileMinAppVersion' in body) {
    const value = body.mobileMinAppVersion;
    if (typeof value !== 'string' || !value.trim()) {
      errors.push({
        field: 'mobileMinAppVersion',
        message: 'mobileMinAppVersion must be a non-empty string.',
      });
    }
  }

  if (Object.keys(body).length === 0) {
    errors.push({ field: 'body', message: 'At least one field is required.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}
