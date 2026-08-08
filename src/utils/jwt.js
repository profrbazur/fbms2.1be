import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Payload intentionally excludes authProvider — authorization decisions
 * (role/department checks) never branch on how the user authenticated,
 * so a future switch to "google" requires no changes here.
 */
export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      departmentId: user.departmentId ? user.departmentId.toString() : null,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
