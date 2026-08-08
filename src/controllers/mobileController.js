import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  activateTablet,
  recordHeartbeat,
  getMobileConfig,
  getActiveSurveyForTablet,
} from '../services/mobileService.js';
import { submitFeedback } from '../services/feedbackService.js';

export const postActivate = asyncHandler(async function postActivate(req, res) {
  const { deviceSecret, tablet } = await activateTablet(req.body.activationToken);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Tablet activated successfully. Store this Device Secret securely — it will not be shown again.',
    data: {
      deviceSecret,
      tablet: { deviceCode: tablet.deviceCode, deviceName: tablet.deviceName },
    },
  });
});

export const postHeartbeat = asyncHandler(async function postHeartbeat(req, res) {
  const tablet = await recordHeartbeat(req.tablet, req.body);

  return sendSuccess(res, {
    message: 'Heartbeat recorded successfully.',
    data: {
      lastSeen: tablet.lastSeen,
      appVersion: tablet.appVersion,
      androidVersion: tablet.androidVersion,
    },
  });
});

export const getConfig = asyncHandler(async function getConfig(req, res) {
  const config = await getMobileConfig();

  return sendSuccess(res, {
    message: 'Mobile configuration retrieved successfully.',
    data: { config },
  });
});

export const getSurvey = asyncHandler(async function getSurvey(req, res) {
  const { survey, questions } = await getActiveSurveyForTablet(req.tablet);

  return sendSuccess(res, {
    message: 'Active survey retrieved successfully.',
    data: { survey, questions },
  });
});

export const postFeedback = asyncHandler(async function postFeedback(req, res) {
  const { session, answers } = await submitFeedback(req.tablet, req.body);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Feedback submitted successfully.',
    data: { feedbackSession: session, answers, referenceCode: session.referenceCode },
  });
});

export const postSync = asyncHandler(async function postSync(req, res) {
  return sendSuccess(res, {
    message: 'Sync acknowledged. Offline synchronization is not yet implemented.',
    data: { processed: 0, syncedAt: new Date().toISOString() },
  });
});
