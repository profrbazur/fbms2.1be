/**
 * Wraps an async Express route/controller handler so rejected promises are
 * forwarded to the centralized error-handling middleware instead of
 * requiring a try/catch block in every controller.
 */
export function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
