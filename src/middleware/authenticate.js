import User from '../models/User.js';
import { verifyAuthToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Verifies the Bearer JWT and loads the current user from the database
 * (not just trusting the token payload) so a deactivated account is
 * rejected immediately, per docs/ARCHITECTURE.md's security principles.
 */
export const authenticate = asyncHandler(async function authenticate(
  req,
  res,
  next,
) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Authentication token is required.');
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired authentication token.');
  }

  const user = await User.findById(payload.sub);

  if (!user || !user.isActive) {
    throw new ApiError(401, 'Account is unavailable.');
  }

  req.user = user;
  next();
});
