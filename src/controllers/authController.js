import User from '../models/User.js';
import { signAuthToken, verifyAuthToken } from '../utils/jwt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAuditEvent } from '../services/auditService.js';

/**
 * Deliberately generic error message for both "no such email" and
 * "wrong password" — avoids revealing which one was incorrect
 * (user-enumeration prevention).
 */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

export const login = asyncHandler(async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    '+passwordHash',
  );

  if (!user) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  const passwordMatches = await user.comparePassword(password);

  if (!passwordMatches) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  if (!user.isActive) {
    throw new ApiError(401, 'This account has been deactivated. Contact an administrator.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAuthToken(user);

  await recordAuditEvent({
    actor: user,
    action: 'auth.login',
    entityType: 'auth',
    entityId: user._id,
    entityLabel: user.email,
    req,
  });

  return sendSuccess(res, {
    message: 'Login successful.',
    data: { token, user },
  });
});

export const me = asyncHandler(async function me(req, res) {
  return sendSuccess(res, {
    message: 'Current user retrieved successfully.',
    data: { user: req.user },
  });
});

/**
 * Version 1 has no server-side session to destroy — the client discards
 * its JWT. This endpoint does not require authentication so a client
 * with an already-expired token can still "log out" cleanly. No refresh
 * tokens exist to revoke (explicitly out of scope for P2.0).
 *
 * P8.1: best-effort audit logging only — a valid, still-live Bearer
 * token (the common case: a user clicking Logout while still signed in)
 * is decoded to attribute the event to its user, exactly like `login`.
 * An expired/invalid/missing token is silently skipped rather than
 * rejected — this endpoint's whole reason for staying unauthenticated is
 * so logout always succeeds regardless of token state, and that must not
 * change just to make it auditable.
 */
export const logout = asyncHandler(async function logout(req, res) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyAuthToken(token);
      const user = await User.findById(payload.sub);
      if (user) {
        await recordAuditEvent({
          actor: user,
          action: 'auth.logout',
          entityType: 'auth',
          entityId: user._id,
          entityLabel: user.email,
          req,
        });
      }
    } catch {
      // Expired/invalid token — nothing meaningful to attribute; logout
      // still succeeds below, unchanged.
    }
  }

  return sendSuccess(res, { message: 'Logged out successfully.' });
});
