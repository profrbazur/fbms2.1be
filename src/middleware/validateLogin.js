import { ApiError } from '../utils/ApiError.js';
import { EMAIL_PATTERN } from '../utils/validationPatterns.js';

/**
 * Minimal hand-written validation for the one login field set. A schema
 * validation library (zod/joi) is worth adopting once more endpoints
 * exist with real bodies to validate — see the P2.0 completion report's
 * Future Recommendations.
 */
export function validateLogin(req, res, next) {
  const { email, password } = req.body ?? {};
  const errors = [];

  if (!email || typeof email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required.' });
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.push({ field: 'email', message: 'Email must be a valid email address.' });
  }

  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required.' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed.', errors));
  }

  return next();
}
