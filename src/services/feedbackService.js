import FeedbackSession from '../models/FeedbackSession.js';
import FeedbackAnswer from '../models/FeedbackAnswer.js';
import Question from '../models/Question.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import { resolveActiveSurveyForTablet } from './mobileService.js';

function emptyPagination(limit) {
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  return { page: 1, limit: limitNum, total: 0, pages: 0 };
}

function parseFilterDate(value, field) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${field} must be a valid date.`, [
      { field, message: `${field} must be a valid ISO date string.` },
    ]);
  }
  return parsed;
}

/**
 * Cross-field validation depending on the sibling `questionType`/
 * `options` fields of the Question being answered — the same reasoning
 * as questionService.js's assertValidQuestionFields. Used by the
 * feedback seeder now; a future mobile submission endpoint
 * (POST /api/v1/mobile/feedback) will reuse this unchanged. Returns the
 * normalized answer to persist.
 */
export function validateAnswerForQuestion(question, rawAnswer) {
  const { questionType, options = [] } = question;

  switch (questionType) {
    case 'rating': {
      if (!Number.isInteger(rawAnswer) || rawAnswer < 1 || rawAnswer > 5) {
        throw new ApiError(400, 'A rating answer must be an integer between 1 and 5.', [
          { field: 'answer', message: 'answer must be an integer from 1 to 5.' },
        ]);
      }
      return rawAnswer;
    }
    case 'yes_no': {
      if (typeof rawAnswer !== 'boolean') {
        throw new ApiError(400, 'A yes/no answer must be a boolean.', [
          { field: 'answer', message: 'answer must be true or false.' },
        ]);
      }
      return rawAnswer;
    }
    case 'multiple_choice': {
      if (typeof rawAnswer !== 'string' || !options.includes(rawAnswer)) {
        throw new ApiError(400, "A multiple-choice answer must be one of the question's options.", [
          { field: 'answer', message: `answer must be one of: ${options.join(', ')}.` },
        ]);
      }
      return rawAnswer;
    }
    case 'short_text':
    case 'long_text': {
      if (typeof rawAnswer !== 'string') {
        throw new ApiError(400, 'A text answer must be a string.', [
          { field: 'answer', message: 'answer must be a string.' },
        ]);
      }
      return rawAnswer.trim();
    }
    default:
      throw new ApiError(400, `Unsupported question type "${questionType}".`);
  }
}

/**
 * Department Head/Personnel are always restricted to their own
 * department (strict — unlike Survey's Global-plus-own-department
 * visibility, a FeedbackSession always belongs to exactly one real
 * department, derived from where it was collected). A supplied
 * departmentId query parameter cannot widen this, matching
 * Tablet/Personnel/Location's established pattern.
 */
export async function listFeedbackSessions(
  user,
  { departmentId, locationId, surveyId, dateFrom, dateTo, search, page = 1, limit = 20 } = {},
) {
  const filter = {};

  if (isGlobalReadRole(user.role)) {
    if (departmentId) {
      if (!isValidObjectId(departmentId)) {
        throw new ApiError(400, 'departmentId must be a valid id.', [
          { field: 'departmentId', message: 'Invalid department id.' },
        ]);
      }
      filter.departmentId = departmentId;
    }
  } else {
    if (!user.departmentId) {
      return { feedbackSessions: [], pagination: emptyPagination(limit) };
    }
    filter.departmentId = user.departmentId;
  }

  if (locationId) {
    if (!isValidObjectId(locationId)) {
      throw new ApiError(400, 'locationId must be a valid id.', [
        { field: 'locationId', message: 'Invalid location id.' },
      ]);
    }
    filter.locationId = locationId;
  }

  if (surveyId) {
    if (!isValidObjectId(surveyId)) {
      throw new ApiError(400, 'surveyId must be a valid id.', [
        { field: 'surveyId', message: 'Invalid survey id.' },
      ]);
    }
    filter.surveyId = surveyId;
  }

  if (dateFrom || dateTo) {
    filter.submittedAt = {};
    if (dateFrom) filter.submittedAt.$gte = parseFilterDate(dateFrom, 'dateFrom');
    if (dateTo) filter.submittedAt.$lte = parseFilterDate(dateTo, 'dateTo');
  }

  if (search) {
    filter.referenceCode = new RegExp(escapeRegExp(search.trim()), 'i');
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  const [feedbackSessions, total] = await Promise.all([
    FeedbackSession.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limitNum),
    FeedbackSession.countDocuments(filter),
  ]);

  return {
    feedbackSessions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

function assertSessionVisible(user, session) {
  if (isGlobalReadRole(user.role)) return;

  const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
  if (ownDepartmentId !== session.departmentId.toString()) {
    throw new ApiError(403, 'You do not have access to this feedback session.');
  }
}

/**
 * Returns the session plus its answers, sorted by the answered
 * question's own `order` (populated for display — questionText/
 * options/required — since a details view of an answer with no
 * question text would be meaningless). No separate endpoint exists for
 * answers alone; per this phase's endpoint list, the detail response
 * always includes them together.
 */
export async function getFeedbackSessionById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Feedback session not found.');
  }

  const session = await FeedbackSession.findById(id);

  if (!session) {
    throw new ApiError(404, 'Feedback session not found.');
  }

  assertSessionVisible(user, session);

  const answers = await FeedbackAnswer.find({ feedbackSessionId: session._id }).populate(
    'questionId',
    'questionText order options required',
  );

  answers.sort((a, b) => (a.questionId?.order ?? 0) - (b.questionId?.order ?? 0));

  return { session, answers };
}

const REFERENCE_CODE_MAX_ATTEMPTS = 5;

/**
 * Matched/upserted-by convention mirrors feedbackSeeder.js's own
 * FB-YYYY-NNNNNN scheme, so seeded and real-submission reference codes
 * share one visible format. Retries on a collision against the unique
 * index rather than trusting a single read-then-write round trip alone
 * — the same defensive pattern tabletService.js's activation-token
 * generation already uses. A proper atomic counter collection would
 * remove the (small, retried) race window entirely; deferred as a
 * future hardening item since Version 1's kiosk submission volume is
 * low enough that the retry loop is sufficient.
 */
async function generateUniqueReferenceCode() {
  const prefix = `FB-${new Date().getUTCFullYear()}-`;

  for (let attempt = 0; attempt < REFERENCE_CODE_MAX_ATTEMPTS; attempt += 1) {
    const latest = await FeedbackSession.findOne({
      referenceCode: new RegExp(`^${prefix}`),
    }).sort({ referenceCode: -1 });

    const nextSequence = latest ? Number(latest.referenceCode.slice(prefix.length)) + 1 : 1;
    const candidate = `${prefix}${String(nextSequence).padStart(6, '0')}`;

    const exists = await FeedbackSession.findOne({ referenceCode: candidate });
    if (!exists) return candidate;
  }

  throw new ApiError(500, 'Unable to generate a unique feedback reference code.');
}

/**
 * POST /api/v1/mobile/feedback (P5.1) — the only writer of
 * FeedbackSession/FeedbackAnswer outside the seeder. departmentId/
 * locationId are always derived from the authenticated `tablet`, never
 * from `payload` (validateMobile.js's validateFeedbackSubmission
 * already rejects either as an unknown field before this ever runs).
 * The submitted `surveyId` must exactly match whichever survey
 * mobileService.resolveActiveSurveyForTablet currently resolves for
 * this tablet — rejects a submission against a stale/cached survey the
 * tablet no longer has active (swapped, unpublished, or archived since
 * the tablet last fetched it via GET /mobile/survey).
 */
export async function submitFeedback(tablet, payload) {
  const { surveyId, submittedAt, completedAt, answers } = payload;

  const activeSurvey = await resolveActiveSurveyForTablet(tablet);

  if (!activeSurvey || activeSurvey._id.toString() !== surveyId) {
    throw new ApiError(409, 'This survey is no longer the active survey for this tablet.');
  }

  const submittedDate = new Date(submittedAt);
  const completedDate = new Date(completedAt);

  if (Number.isNaN(submittedDate.getTime()) || Number.isNaN(completedDate.getTime())) {
    throw new ApiError(400, 'submittedAt and completedAt must be valid ISO date strings.', [
      { field: 'submittedAt', message: 'submittedAt/completedAt must be valid ISO date strings.' },
    ]);
  }

  if (completedDate.getTime() < submittedDate.getTime()) {
    throw new ApiError(400, 'completedAt cannot be earlier than submittedAt.', [
      { field: 'completedAt', message: 'completedAt must be on or after submittedAt.' },
    ]);
  }

  const questions = await Question.find({ surveyId: activeSurvey._id });
  const questionById = new Map(questions.map((question) => [question._id.toString(), question]));
  const answeredQuestionIds = new Set();

  answers.forEach((answerPayload, index) => {
    if (!questionById.has(answerPayload.questionId)) {
      throw new ApiError(400, 'One or more answers reference a question outside the active survey.', [
        { field: `answers[${index}].questionId`, message: 'questionId does not belong to the active survey.' },
      ]);
    }
    answeredQuestionIds.add(answerPayload.questionId);
  });

  const missingRequired = questions.filter(
    (question) => question.required && !answeredQuestionIds.has(question._id.toString()),
  );

  if (missingRequired.length > 0) {
    throw new ApiError(
      400,
      'One or more required questions were not answered.',
      missingRequired.map((question) => ({
        field: 'answers',
        message: `Question "${question.questionText}" is required.`,
      })),
    );
  }

  const normalizedAnswers = answers.map((answerPayload) => {
    const question = questionById.get(answerPayload.questionId);
    const normalizedAnswer = validateAnswerForQuestion(question, answerPayload.answer);
    return { questionId: question._id, questionType: question.questionType, answer: normalizedAnswer };
  });

  const referenceCode = await generateUniqueReferenceCode();
  const durationSeconds = Math.max(
    0,
    Math.round((completedDate.getTime() - submittedDate.getTime()) / 1000),
  );

  const session = await FeedbackSession.create({
    referenceCode,
    surveyId: activeSurvey._id,
    tabletId: tablet._id,
    locationId: tablet.locationId,
    departmentId: tablet.departmentId,
    submittedAt: submittedDate,
    completedAt: completedDate,
    durationSeconds,
    status: 'completed',
  });

  const createdAnswers = await FeedbackAnswer.insertMany(
    normalizedAnswers.map((answer) => ({ feedbackSessionId: session._id, ...answer })),
  );

  return { session, answers: createdAnswers };
}
