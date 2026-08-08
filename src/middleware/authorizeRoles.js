import { ApiError } from '../utils/ApiError.js';

/**
 * Role check per docs/ARCHITECTURE.md: never trust a client-provided
 * role — this reads only req.user.role, which authenticate() populated
 * from the database.
 */
export function authorizeRoles(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have access to this resource.'));
    }
    return next();
  };
}
