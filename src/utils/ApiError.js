/**
 * Typed application error carrying an HTTP status code and optional
 * field-level error details, understood by the centralized error handler.
 */
export class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
