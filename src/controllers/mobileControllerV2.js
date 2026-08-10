import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  startServiceSession,
  endServiceSession,
  getActiveServiceSessionForTablet,
} from '../services/serviceSessionService.js';
import { submitFeedbackV2 } from '../services/feedbackService.js';

/**
 * V2.4 — POST /api/v2/mobile/staff/login. Never echoes the PIN back, and
 * never returns pinHash (Personnel.pinHash is select:false by default,
 * and startServiceSession never selects it on the returned document).
 */
export const postStaffLogin = asyncHandler(async function postStaffLogin(req, res) {
  const { session, personnel } = await startServiceSession(req.tablet, req.body.pin);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Staff service session started successfully.',
    data: {
      serviceSession: session,
      personnel: {
        id: personnel._id,
        fullName: personnel.fullName,
        position: personnel.position,
      },
    },
  });
});

export const postStaffLogout = asyncHandler(async function postStaffLogout(req, res) {
  const session = await endServiceSession(req.tablet);

  return sendSuccess(res, {
    message: 'Staff service session ended successfully.',
    data: { serviceSession: session },
  });
});

/**
 * GET /api/v2/mobile/staff/active — lets a reconnecting kiosk client
 * resync to the backend's authoritative session state. `serviceSession`
 * is `null` (not a 404) when nobody is currently serving — an idle
 * tablet is a normal, expected state, not an error.
 */
export const getStaffActive = asyncHandler(async function getStaffActive(req, res) {
  const session = await getActiveServiceSessionForTablet(req.tablet);

  return sendSuccess(res, {
    message: 'Active service session retrieved successfully.',
    data: { serviceSession: session },
  });
});

export const postFeedbackV2 = asyncHandler(async function postFeedbackV2(req, res) {
  const activeSession = await getActiveServiceSessionForTablet(req.tablet);
  const { session, answers } = await submitFeedbackV2(req.tablet, req.body, activeSession);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Feedback submitted successfully.',
    data: { feedbackSession: session, answers, referenceCode: session.referenceCode },
  });
});
