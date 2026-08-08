import Tablet from '../models/Tablet.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashDeviceSecret } from '../utils/generateDeviceSecret.js';

/**
 * Dedicated device-credential middleware for /api/v1/mobile/* (P5.1) —
 * deliberately independent of authenticate.js/jwt.js. A tablet is not a
 * User and must never be authenticated with a JWT (per this phase's
 * explicit instruction). Expects `Authorization: Device <secret>` — a
 * distinct auth scheme from staff's `Bearer <jwt>`, so the two can never
 * be confused in logs, client code, or accidentally accepted by the
 * wrong middleware. Re-checks `isActive` on every call (not just at
 * activation time), so deactivating a tablet immediately locks out all
 * of its future mobile requests. See docs/MOBILE_PROTOCOL.md.
 */
export const authenticateDevice = asyncHandler(async function authenticateDevice(
  req,
  res,
  next,
) {
  const header = req.headers.authorization || '';
  const [scheme, secret] = header.split(' ');

  if (scheme !== 'Device' || !secret) {
    throw new ApiError(401, 'Device authentication is required.');
  }

  const deviceSecretHash = hashDeviceSecret(secret);
  const tablet = await Tablet.findOne({ deviceSecretHash });

  if (!tablet || !tablet.isActive) {
    throw new ApiError(401, 'Invalid or inactive device credential.');
  }

  req.tablet = tablet;
  next();
});
