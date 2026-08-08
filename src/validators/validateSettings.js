import { ApiError } from '../utils/ApiError.js';
import { DATE_FORMATS, TIME_FORMATS } from '../models/OrganizationSettings.js';
import { VALID_TREND_DAYS } from '../services/analyticsService.js';
import { EMAIL_PATTERN, HEX_COLOR_PATTERN } from '../utils/validationPatterns.js';

/**
 * PATCH /api/v1/settings body validation (P8.0). A superset of
 * validateOrganizationSettings.js's fields (Institution/Branding) plus
 * this phase's new Operational/General fields — kept as its own file
 * rather than extending the existing validator, since `logoUrl` and
 * `mobileMinAppVersion` are deliberately NOT accepted here (logo is
 * upload-only, ADR-044; `mobileMinAppVersion` remains
 * /api/v1/organization-only, outside this phase's approved Operational
 * Settings list) — two genuinely different allowed-field sets for two
 * route surfaces over the same document. The email/hex-color regexes are
 * shared via utils/validationPatterns.js (P8.2 polish pass), not
 * redefined here.
 */

const ALLOWED_FIELDS = [
  // Institution
  'universityName',
  'address',
  'contactNumber',
  'email',
  'contactPerson',
  // Branding
  'primaryColor',
  'secondaryColor',
  // Operational
  'mobileHeartbeatIntervalSeconds',
  'feedbackSessionTimeoutSeconds',
  'defaultTrendWindowDays',
  'defaultPaginationSize',
  // General
  'timezone',
  'dateFormat',
  'timeFormat',
];

const REQUIRED_STRING_FIELDS = [
  'universityName',
  'address',
  'contactNumber',
  'email',
  'contactPerson',
  'primaryColor',
  'secondaryColor',
  'timezone',
];

// Intl.supportedValuesOf is available in Node 18+ (this project's
// runtime) — validates against the real IANA timezone database rather
// than an invented/incomplete hardcoded list. 'UTC' is added explicitly:
// depending on the host's bundled ICU data, Node's own supported-values
// list does not always include it (observed: absent even as 'Etc/UTC'
// in this project's runtime) despite being a universally recognized,
// commonly-offered timezone value.
const VALID_TIMEZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

function validateRequiredNumber(body, errors, field, { min, max, integer = false } = {}) {
  if (!(field in body)) return;
  const value = body[field];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ field, message: `${field} must be a number.` });
    return;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push({ field, message: `${field} must be a whole number.` });
    return;
  }
  if (min !== undefined && value < min) {
    errors.push({ field, message: `${field} must be at least ${min}.` });
    return;
  }
  if (max !== undefined && value > max) {
    errors.push({ field, message: `${field} must be at most ${max}.` });
  }
}

export function validateSettings(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  const unknownFields = Object.keys(body).filter((key) => !ALLOWED_FIELDS.includes(key));
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
    if (typeof body[field] === 'string' && body[field].trim() && !HEX_COLOR_PATTERN.test(body[field].trim())) {
      errors.push({ field, message: `${field} must be a hex color (e.g. #002E1F).` });
    }
  });

  if (typeof body.timezone === 'string' && body.timezone.trim() && !VALID_TIMEZONES.has(body.timezone.trim())) {
    errors.push({ field: 'timezone', message: 'timezone must be a valid IANA timezone identifier (e.g. Asia/Manila).' });
  }

  if ('dateFormat' in body && !DATE_FORMATS.includes(body.dateFormat)) {
    errors.push({ field: 'dateFormat', message: `dateFormat must be one of: ${DATE_FORMATS.join(', ')}.` });
  }

  if ('timeFormat' in body && !TIME_FORMATS.includes(body.timeFormat)) {
    errors.push({ field: 'timeFormat', message: `timeFormat must be one of: ${TIME_FORMATS.join(', ')}.` });
  }

  validateRequiredNumber(body, errors, 'mobileHeartbeatIntervalSeconds', { min: 30 });
  validateRequiredNumber(body, errors, 'feedbackSessionTimeoutSeconds', { min: 30, max: 3600 });
  validateRequiredNumber(body, errors, 'defaultPaginationSize', { min: 1, max: 100, integer: true });

  if ('defaultTrendWindowDays' in body && !VALID_TREND_DAYS.includes(body.defaultTrendWindowDays)) {
    errors.push({
      field: 'defaultTrendWindowDays',
      message: `defaultTrendWindowDays must be one of: ${VALID_TREND_DAYS.join(', ')}.`,
    });
  }

  if (Object.keys(body).length === 0) {
    errors.push({ field: 'body', message: 'At least one field is required.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}
