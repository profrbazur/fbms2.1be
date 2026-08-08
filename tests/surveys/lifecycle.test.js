import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const publish = (token, id) =>
  request(app)
    .post(`/api/v1/surveys/${id}/publish`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const unpublish = (token, id) =>
  request(app)
    .post(`/api/v1/surveys/${id}/unpublish`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const archive = (token, id) =>
  request(app)
    .post(`/api/v1/surveys/${id}/archive`)
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/surveys/:id/publish', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await publish(undefined, target._id.toString());
    expect(res.status).toBe(401);
  });

  it('rejects non-Super Admin with 403', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await publish(roles.libraryHead.token, target._id.toString());
    expect(res.status).toBe(403);
  });

  it('publishes a draft survey with at least one question, setting publishedAt', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    expect(target.isPublished).toBe(false);

    const res = await publish(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.survey.isPublished).toBe(true);
    expect(res.body.data.survey.publishedAt).not.toBeNull();
    expect(res.body.data.survey.status).toBe('published');
  });

  it('rejects publishing an already-published survey with 409', async () => {
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    expect(target.isPublished).toBe(true);

    const res = await publish(roles.superAdmin.token, target._id.toString());
    expect(res.status).toBe(409);
  });

  it('rejects publishing a survey with zero questions with 409', async () => {
    const empty = await Survey.create({ title: 'Empty Survey For Publish Test' });

    const res = await publish(roles.superAdmin.token, empty._id.toString());
    expect(res.status).toBe(409);
  });

  it('rejects publishing an archived survey with 409', async () => {
    const archived = await Survey.create({ title: 'Archived For Publish Test', isArchived: true });

    const res = await publish(roles.superAdmin.token, archived._id.toString());
    expect(res.status).toBe(409);
  });

  it('returns 404 for a nonexistent survey', async () => {
    const res = await publish(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/surveys/:id/unpublish', () => {
  it('rejects non-Super Admin with 403', async () => {
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const res = await unpublish(roles.registrarHead.token, target._id.toString());
    expect(res.status).toBe(403);
  });

  it('unpublishes a published survey', async () => {
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    expect(target.isPublished).toBe(true);

    const res = await unpublish(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.survey.isPublished).toBe(false);
    expect(res.body.data.survey.status).toBe('draft');
  });

  it('allows editing again once unpublished', async () => {
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    expect(target.isPublished).toBe(false); // unpublished by the previous test

    const res = await request(app)
      .patch(`/api/v1/surveys/${target._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ description: 'Updated after unpublish.' });

    expect(res.status).toBe(200);
  });

  it('rejects unpublishing a survey that is not published with 409', async () => {
    // "Registrar Office Feedback" was already unpublished by the test
    // above; "Library Services Feedback" was already published by the
    // publish describe block above, so it can't be used here.
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    expect(target.isPublished).toBe(false);

    const res = await unpublish(roles.superAdmin.token, target._id.toString());
    expect(res.status).toBe(409);
  });

  it('rejects unpublishing an archived survey with 409', async () => {
    const archived = await Survey.create({
      title: 'Archived For Unpublish Test',
      isArchived: true,
      isPublished: true,
    });

    const res = await unpublish(roles.superAdmin.token, archived._id.toString());
    expect(res.status).toBe(409);
  });

  it('returns 404 for a nonexistent survey', async () => {
    const res = await unpublish(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/surveys/:id/archive', () => {
  it('rejects non-Super Admin with 403', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await archive(roles.libraryHead.token, target._id.toString());
    expect(res.status).toBe(403);
  });

  it('archives a draft survey', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    expect(target.isArchived).toBe(false);

    const res = await archive(roles.superAdmin.token, target._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.survey.isArchived).toBe(true);
    expect(res.body.data.survey.status).toBe('archived');
  });

  it('archiving a survey frees its location for reassignment', async () => {
    const Location = (await import('../../src/models/Location.js')).default;
    const location = await Location.findOne({ code: 'REG-LOC-01' });
    const locationSurvey = await Survey.create({ title: 'Location Survey For Archive Test', locationId: location._id, departmentId: location.departmentId });

    const archiveRes = await archive(roles.superAdmin.token, locationSurvey._id.toString());
    expect(archiveRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/surveys')
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ title: 'New Survey On Freed Location', locationId: location._id.toString() });

    expect(createRes.status).toBe(201);
  });

  it('rejects archiving an already-archived survey with 409', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    expect(target.isArchived).toBe(true);

    const res = await archive(roles.superAdmin.token, target._id.toString());
    expect(res.status).toBe(409);
  });

  it('archived survey questions can no longer be added or edited', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const question = await Question.findOne({ surveyId: target._id });

    const createRes = await request(app)
      .post(`/api/v1/surveys/${target._id.toString()}/questions`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ questionText: 'New question', questionType: 'short_text' });
    expect(createRes.status).toBe(409);

    const updateRes = await request(app)
      .patch(`/api/v1/questions/${question._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ questionText: 'Edited text' });
    expect(updateRes.status).toBe(409);
  });

  it('returns 404 for a nonexistent survey', async () => {
    const res = await archive(roles.superAdmin.token, '507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});
