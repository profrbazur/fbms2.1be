import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const createQuestion = (token, surveyId, body) =>
  request(app)
    .post(`/api/v1/surveys/${surveyId}/questions`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchQuestion = (token, id, body) =>
  request(app)
    .patch(`/api/v1/questions/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

let roles;
let draftSurvey;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  // "Library Services Feedback" is seeded as a draft (unpublished, unarchived).
  draftSurvey = await Survey.findOne({ title: 'Library Services Feedback' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/surveys/:id/questions', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await createQuestion(undefined, draftSurvey._id.toString(), {
      questionText: 'Q',
      questionType: 'short_text',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-Super Admin with 403', async () => {
    const res = await createQuestion(roles.libraryHead.token, draftSurvey._id.toString(), {
      questionText: 'Q',
      questionType: 'short_text',
    });
    expect(res.status).toBe(403);
  });

  it('creates a rating question, auto-assigning the next order', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'How helpful was the staff?',
      questionType: 'rating',
      required: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.question.questionType).toBe('rating');
    expect(res.body.data.question.order).toBe(4); // 3 seeded questions already exist
    expect(res.body.data.question.options).toEqual([]);
  });

  it('increments the parent survey\'s questionCount', async () => {
    const survey = await Survey.findById(draftSurvey._id);
    expect(survey.questionCount).toBe(4);
  });

  it('creates a yes_no question', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Did you find what you needed?',
      questionType: 'yes_no',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.question.required).toBe(false);
  });

  it('creates a short_text question', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Any quick feedback?',
      questionType: 'short_text',
    });
    expect(res.status).toBe(201);
  });

  it('creates a long_text question', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Describe your experience in detail.',
      questionType: 'long_text',
    });
    expect(res.status).toBe(201);
  });

  it('creates a multiple_choice question with valid options', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Which resource did you use?',
      questionType: 'multiple_choice',
      options: ['Books', 'Digital', 'Study Room'],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.question.options).toEqual(['Books', 'Digital', 'Study Room']);
  });

  it('rejects a multiple_choice question with fewer than 2 options', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Bad options',
      questionType: 'multiple_choice',
      options: ['Only one'],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a multiple_choice question with duplicate options', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Duplicate options',
      questionType: 'multiple_choice',
      options: ['Same', 'same'],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a multiple_choice question with an empty-string option', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Empty option',
      questionType: 'multiple_choice',
      options: ['Valid', '   '],
    });
    expect(res.status).toBe(400);
  });

  it('rejects options supplied on a non-multiple_choice question', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Rating with stray options',
      questionType: 'rating',
      options: ['A', 'B'],
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid questionType', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Bad type',
      questionType: 'essay',
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {});
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'questionText')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'questionType')).toBe(true);
  });

  it('respects an explicitly supplied order value', async () => {
    const res = await createQuestion(roles.superAdmin.token, draftSurvey._id.toString(), {
      questionText: 'Explicit order question',
      questionType: 'short_text',
      order: 50,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.question.order).toBe(50);
  });

  it('rejects adding a question to a published survey with 409', async () => {
    const published = await Survey.findOne({ title: 'Registrar Office Feedback' });
    expect(published.isPublished).toBe(true);

    const res = await createQuestion(roles.superAdmin.token, published._id.toString(), {
      questionText: 'Should be blocked',
      questionType: 'short_text',
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 for a nonexistent survey', async () => {
    const res = await createQuestion(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      questionText: 'Q',
      questionType: 'short_text',
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/questions/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const question = await Question.findOne({ surveyId: draftSurvey._id });
    const res = await patchQuestion(undefined, question._id.toString(), { required: true });
    expect(res.status).toBe(401);
  });

  it('rejects non-Super Admin with 403', async () => {
    const question = await Question.findOne({ surveyId: draftSurvey._id });
    const res = await patchQuestion(roles.libraryHead.token, question._id.toString(), {
      required: true,
    });
    expect(res.status).toBe(403);
  });

  it('updates questionText, required, and order', async () => {
    const question = await Question.findOne({ surveyId: draftSurvey._id, questionType: 'yes_no' });

    const res = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      questionText: 'Updated question text?',
      required: true,
      order: 2,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.question.questionText).toBe('Updated question text?');
    expect(res.body.data.question.required).toBe(true);
    expect(res.body.data.question.order).toBe(2);
  });

  it('changing questionType to multiple_choice requires options in the same request', async () => {
    const question = await Question.findOne({ surveyId: draftSurvey._id, questionType: 'short_text' });

    const failRes = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      questionType: 'multiple_choice',
    });
    expect(failRes.status).toBe(400);

    const okRes = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      questionType: 'multiple_choice',
      options: ['Option A', 'Option B'],
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.question.options).toEqual(['Option A', 'Option B']);
  });

  it('changing questionType away from multiple_choice clears options', async () => {
    const question = await Question.findOne({
      surveyId: draftSurvey._id,
      questionType: 'multiple_choice',
      questionText: { $ne: 'Which resource did you use?' },
    });

    const res = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      questionType: 'yes_no',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.question.options).toEqual([]);
  });

  it('updating options on an existing multiple_choice question re-validates them', async () => {
    const question = await Question.findOne({
      surveyId: draftSurvey._id,
      questionText: 'Which resource did you use?',
    });

    const res = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      options: ['Only one'],
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields with 400', async () => {
    const question = await Question.findOne({ surveyId: draftSurvey._id });
    const res = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('rejects editing a question that belongs to a published survey with 409', async () => {
    const published = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const question = await Question.findOne({ surveyId: published._id });

    const res = await patchQuestion(roles.superAdmin.token, question._id.toString(), {
      required: false,
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 for a nonexistent question', async () => {
    const res = await patchQuestion(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      required: true,
    });
    expect(res.status).toBe(404);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await patchQuestion(roles.superAdmin.token, 'not-a-valid-id', { required: true });
    expect(res.status).toBe(404);
  });
});
