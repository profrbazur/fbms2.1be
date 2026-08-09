import Survey from '../models/Survey.js';
import Question from '../models/Question.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import { assertDepartmentIsUsable, assertLocationIsUsable } from './locationService.js';
import { assertValidQuestionFields, nextQuestionOrder } from './questionService.js';

/**
 * Enforces "exactly one of Global / Department / Location" (this
 * phase's design principle) and the "never trust departmentId from the
 * frontend when locationId exists — always derive it" rule.
 * `locationId` always takes priority: when present, `departmentId` is
 * silently re-derived from that location regardless of what the client
 * sent (a client mirroring the derived value back is expected UI
 * behavior, not an error). Returns the resolved
 * { departmentId, locationId } to persist.
 */
async function resolveSurveyAssignment({ departmentId, locationId }) {
  if (locationId) {
    const location = await assertLocationIsUsable(locationId);
    return { departmentId: location.departmentId, locationId };
  }

  if (departmentId) {
    await assertDepartmentIsUsable(departmentId);
    return { departmentId, locationId: null };
  }

  return { departmentId: null, locationId: null };
}

/**
 * "Only one survey may be assigned to a location at any given time." An
 * archived survey no longer counts as occupying its location — archiving
 * frees the location for a new survey (a location without an assigned
 * survey is explicitly valid per this phase's design principles).
 */
async function assertLocationNotAlreadyAssigned(locationId, excludeSurveyId) {
  const query = { locationId, isArchived: false };
  if (excludeSurveyId) query._id = { $ne: excludeSurveyId };

  const conflicting = await Survey.findOne(query);
  if (conflicting) {
    throw new ApiError(409, 'This location already has an active (non-archived) survey assigned.');
  }
}

/**
 * Department Head/Personnel (view-only per this phase's Authorization
 * section) see Global surveys (departmentId: null) plus their own
 * department's surveys — never another department's. Super Admin sees
 * everything and may optionally narrow by departmentId/locationId.
 *
 * `includeGlobal` (default `false`, opt-in only — the Surveys module's own
 * page and its tested contract, `backend/tests/surveys/read.test.js`'s
 * "supports the departmentId filter for Super Admin", rely on the default
 * strict-equality behavior: a Super Admin's own departmentId narrowing on
 * *this* module is a Survey-ownership browse, "surveys this department
 * owns"). V2.1.1: Reports opts into `includeGlobal: true` for its Active
 * Surveys/Survey Performance sections specifically, because a department's
 * *feedback* can legitimately come from a Global survey (ADR-028 —
 * FeedbackSession.departmentId, never Survey.departmentId, is the
 * attribution source of truth) and Reports' visibility there should match
 * what a Department Head/Personnel of that same department already sees
 * (the `$or` branch just below, unaffected by this flag).
 */
export async function listSurveys(
  user,
  {
    departmentId,
    locationId,
    isPublished,
    isArchived,
    search,
    page = 1,
    limit = 20,
    includeGlobal = false,
  } = {},
) {
  const filter = {};
  const andConditions = [];

  if (isGlobalReadRole(user.role)) {
    if (departmentId) {
      if (!isValidObjectId(departmentId)) {
        throw new ApiError(400, 'departmentId must be a valid id.', [
          { field: 'departmentId', message: 'Invalid department id.' },
        ]);
      }
      if (includeGlobal) {
        andConditions.push({ $or: [{ departmentId: null }, { departmentId }] });
      } else {
        filter.departmentId = departmentId;
      }
    }
  } else if (user.departmentId) {
    andConditions.push({ $or: [{ departmentId: null }, { departmentId: user.departmentId }] });
  } else {
    filter.departmentId = null;
  }

  if (locationId) {
    if (!isValidObjectId(locationId)) {
      throw new ApiError(400, 'locationId must be a valid id.', [
        { field: 'locationId', message: 'Invalid location id.' },
      ]);
    }
    filter.locationId = locationId;
  }

  if (isPublished !== undefined) filter.isPublished = isPublished;
  if (isArchived !== undefined) filter.isArchived = isArchived;

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    andConditions.push({ $or: [{ title: regex }, { description: regex }] });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  const [surveys, total] = await Promise.all([
    Survey.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Survey.countDocuments(filter),
  ]);

  return {
    surveys,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

function assertSurveyVisible(user, survey) {
  if (isGlobalReadRole(user.role)) return;

  const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
  const isGlobal = !survey.departmentId;
  const isOwnDepartment = survey.departmentId && survey.departmentId.toString() === ownDepartmentId;

  if (!isGlobal && !isOwnDepartment) {
    throw new ApiError(403, 'You do not have access to this survey.');
  }
}

export async function getSurveyById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Survey not found.');
  }

  const survey = await Survey.findById(id);

  if (!survey) {
    throw new ApiError(404, 'Survey not found.');
  }

  assertSurveyVisible(user, survey);

  return survey;
}

export async function createSurvey(payload) {
  const { title, description = '', departmentId = null, locationId = null } = payload;

  const resolved = await resolveSurveyAssignment({ departmentId, locationId });

  if (resolved.locationId) {
    await assertLocationNotAlreadyAssigned(resolved.locationId);
  }

  const survey = await Survey.create({
    title: title.trim(),
    description,
    departmentId: resolved.departmentId,
    locationId: resolved.locationId,
  });

  return survey;
}

function assertSurveyEditable(survey) {
  if (survey.isArchived) {
    throw new ApiError(409, 'Archived surveys are read-only.');
  }
  if (survey.isPublished) {
    throw new ApiError(409, 'A published survey cannot be edited. Unpublish it first.');
  }
}

export async function updateSurvey(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Survey not found.');
  }

  const survey = await Survey.findById(id);

  if (!survey) {
    throw new ApiError(404, 'Survey not found.');
  }

  assertSurveyEditable(survey);

  if (updates.departmentId !== undefined || updates.locationId !== undefined) {
    const resolved = await resolveSurveyAssignment({
      departmentId: updates.departmentId !== undefined ? updates.departmentId : survey.departmentId,
      locationId: updates.locationId !== undefined ? updates.locationId : survey.locationId,
    });

    if (resolved.locationId) {
      await assertLocationNotAlreadyAssigned(resolved.locationId, survey._id);
    }

    survey.departmentId = resolved.departmentId;
    survey.locationId = resolved.locationId;
  }

  if (updates.title !== undefined) survey.title = updates.title.trim();
  if (updates.description !== undefined) survey.description = updates.description;

  await survey.save();

  return survey;
}

export async function publishSurvey(id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Survey not found.');
  }

  const survey = await Survey.findById(id);

  if (!survey) {
    throw new ApiError(404, 'Survey not found.');
  }

  if (survey.isArchived) {
    throw new ApiError(409, 'Archived surveys are read-only.');
  }
  if (survey.isPublished) {
    throw new ApiError(409, 'Survey is already published.');
  }
  if (survey.questionCount === 0) {
    throw new ApiError(409, 'Cannot publish a survey with no questions.');
  }

  survey.isPublished = true;
  survey.publishedAt = new Date();
  await survey.save();

  return survey;
}

export async function unpublishSurvey(id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Survey not found.');
  }

  const survey = await Survey.findById(id);

  if (!survey) {
    throw new ApiError(404, 'Survey not found.');
  }

  if (survey.isArchived) {
    throw new ApiError(409, 'Archived surveys are read-only.');
  }
  if (!survey.isPublished) {
    throw new ApiError(409, 'Survey is not published.');
  }

  survey.isPublished = false;
  await survey.save();

  return survey;
}

export async function archiveSurvey(id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Survey not found.');
  }

  const survey = await Survey.findById(id);

  if (!survey) {
    throw new ApiError(404, 'Survey not found.');
  }

  if (survey.isArchived) {
    throw new ApiError(409, 'Survey is already archived.');
  }

  survey.isArchived = true;
  await survey.save();

  return survey;
}

export async function listQuestionsForSurvey(user, surveyId) {
  const survey = await getSurveyById(user, surveyId);

  const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });

  return questions;
}

export async function createQuestionForSurvey(surveyId, payload) {
  if (!isValidObjectId(surveyId)) {
    throw new ApiError(404, 'Survey not found.');
  }

  const survey = await Survey.findById(surveyId);

  if (!survey) {
    throw new ApiError(404, 'Survey not found.');
  }

  assertSurveyEditable(survey);

  const { questionText, questionType, required = false, order, options } = payload;

  const normalizedOptions = assertValidQuestionFields({ questionType, options });
  const resolvedOrder = order !== undefined ? order : await nextQuestionOrder(survey._id);

  const question = await Question.create({
    surveyId: survey._id,
    questionText: questionText.trim(),
    questionType,
    required,
    order: resolvedOrder,
    options: normalizedOptions,
  });

  await Survey.updateOne({ _id: survey._id }, { $inc: { questionCount: 1 } });

  return question;
}
