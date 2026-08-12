import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getNotifications } from '../services/notificationService.js';

export const getNotificationsHandler = asyncHandler(async function getNotificationsHandler(req, res) {
  const result = await getNotifications(req.user);

  return sendSuccess(res, {
    message: 'Notifications retrieved successfully.',
    data: result,
  });
});
