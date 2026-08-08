import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { listFeedbackSessions, getFeedbackSessionById } from '../services/feedbackService.js';

export const getFeedbackList = asyncHandler(async function getFeedbackList(req, res) {
  const { departmentId, locationId, surveyId, dateFrom, dateTo, search, page, limit } = req.query;

  const { feedbackSessions, pagination } = await listFeedbackSessions(req.user, {
    departmentId,
    locationId,
    surveyId,
    dateFrom,
    dateTo,
    search,
    page,
    limit,
  });

  return sendSuccess(res, {
    message: 'Feedback sessions retrieved successfully.',
    data: { feedbackSessions, pagination },
  });
});

export const getFeedbackDetail = asyncHandler(async function getFeedbackDetail(req, res) {
  const { session, answers } = await getFeedbackSessionById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Feedback session retrieved successfully.',
    data: { feedbackSession: session, answers },
  });
});
