import Tablet from '../models/Tablet.js';
import Survey from '../models/Survey.js';
import Question from '../models/Question.js';
import { ApiError } from '../utils/ApiError.js';
import { generateDeviceSecret, hashDeviceSecret } from '../utils/generateDeviceSecret.js';
import { getOrganizationSettings } from './organizationService.js';

/**
 * Exchanges a single-use activationToken for a permanent Device Secret
 * (P5.1). Deliberately returns the identical generic message for "no
 * such token" and "token already consumed" — the same enumeration-
 * safety principle already applied to POST /api/v1/auth/login's
 * indistinguishable wrong-password/unknown-email message — so a caller
 * can't probe which activation tokens have already been used. A
 * correct-but-deactivated tablet gets its own distinct message
 * (mirroring login's separate "account deactivated" message), since
 * that leak is a legitimate support scenario, not an enumeration risk.
 */
export async function activateTablet(activationToken) {
  const tablet = await Tablet.findOne({ activationToken });

  if (!tablet || tablet.activationConsumedAt) {
    throw new ApiError(401, 'Invalid or already-used activation token.');
  }

  if (!tablet.isActive) {
    throw new ApiError(403, 'This tablet has been deactivated. Contact an administrator.');
  }

  const deviceSecret = generateDeviceSecret();
  tablet.deviceSecretHash = hashDeviceSecret(deviceSecret);
  tablet.activationConsumedAt = new Date();
  await tablet.save();

  return { deviceSecret, tablet };
}

/**
 * Updates only lastSeen/appVersion/androidVersion — no other tablet
 * field is reachable through this path (validateMobile.js's
 * validateHeartbeat already rejects any other field as unknown; this
 * function additionally never touches anything beyond these three even
 * if called directly, per "Do not allow arbitrary tablet updates").
 */
export async function recordHeartbeat(tablet, { appVersion, androidVersion } = {}) {
  if (appVersion !== undefined) tablet.appVersion = appVersion;
  if (androidVersion !== undefined) tablet.androidVersion = androidVersion;
  tablet.lastSeen = new Date();
  await tablet.save();

  return tablet;
}

/**
 * Only the fields the Android client actually needs — per this phase's
 * explicit "Do not expose unnecessary administrative data" instruction.
 * No institutional contact info, no internal ids, no counts.
 */
export async function getMobileConfig() {
  const settings = await getOrganizationSettings();

  return {
    systemName: settings.universityName,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    heartbeatIntervalSeconds: settings.mobileHeartbeatIntervalSeconds,
    minAppVersion: settings.mobileMinAppVersion,
    // P8.0's "Feedback Session Timeout" — how long the kiosk should wait
    // on an idle in-progress feedback session before resetting to Home.
    // No backend enforcement exists for this (Version 1's feedback
    // submission is a single atomic POST, not a tracked server-side
    // session) — it exists purely for the Android client to read and
    // apply locally, the same reasoning heartbeatIntervalSeconds/
    // minAppVersion already established for this endpoint.
    feedbackSessionTimeoutSeconds: settings.feedbackSessionTimeoutSeconds,
  };
}

/**
 * Location > Department > Global precedence (P5.1's approved rule, per
 * docs/NEXT_TASK.md's pre-recommendation from P5.0). Only ever
 * considers published, non-archived surveys — an inactive survey must
 * never reach the Android client. Shared by both GET /mobile/survey and
 * feedbackService.submitFeedback (which re-resolves this at submission
 * time to reject a stale/cached survey the tablet no longer has active).
 */
export async function resolveActiveSurveyForTablet(tablet) {
  const baseFilter = { isPublished: true, isArchived: false };

  const locationSurvey = await Survey.findOne({ ...baseFilter, locationId: tablet.locationId });
  if (locationSurvey) return locationSurvey;

  const departmentSurvey = await Survey.findOne({
    ...baseFilter,
    departmentId: tablet.departmentId,
    locationId: null,
  });
  if (departmentSurvey) return departmentSurvey;

  const globalSurvey = await Survey.findOne({ ...baseFilter, departmentId: null, locationId: null });
  if (globalSurvey) return globalSurvey;

  return null;
}

export async function getActiveSurveyForTablet(tablet) {
  const survey = await resolveActiveSurveyForTablet(tablet);

  if (!survey) {
    throw new ApiError(404, 'No active survey is available for this tablet.');
  }

  const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });

  return { survey, questions };
}
