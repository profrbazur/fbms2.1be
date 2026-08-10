import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Location from '../../src/models/Location.js';
import Department from '../../src/models/Department.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getSurvey = (headers) => request(app).get('/api/v1/mobile/survey').set(headers ?? {});

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/mobile/survey', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getSurvey();
    expect(res.status).toBe(401);
  });

  it('resolves the Department survey when no Location survey exists (Registrar tablet)', async () => {
    const { deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01');
    const res = await getSurvey(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.survey.title).toBe('Registrar Office Feedback');
    // V2.5 — grew from 4 to 7 questions (three new Courtesy/Clarity/
    // Waiting Time rating questions appended at order 5-7).
    expect(res.body.data.questions.length).toBe(7);
    expect(res.body.data.questions.map((q) => q.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('resolves the Global survey when no Location or Department survey exists (Library tablet — its own department survey is still a draft)', async () => {
    const { deviceSecret } = await activateTabletByDeviceCode('LIB-TAB-01');
    const res = await getSurvey(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.survey.title).toBe('General Service Feedback');
    expect(res.body.data.survey.locationId).toBeNull();
    expect(res.body.data.survey.departmentId).toBeNull();
  });

  it('resolves the Location survey over both Department and Global when one is published there', async () => {
    const location = await Location.findOne({ code: 'REG-LOC-01' });
    const department = await Department.findOne({ code: 'REG' });

    const locationSurvey = await Survey.create({
      title: 'Registrar Main Counter Kiosk Survey',
      description: 'Location-scoped smoke fixture',
      departmentId: department._id,
      locationId: location._id,
      isPublished: true,
      isArchived: false,
      publishedAt: new Date(),
    });
    await Question.create({
      surveyId: locationSurvey._id,
      questionText: 'How was your visit to this specific counter?',
      questionType: 'rating',
      required: true,
      order: 1,
    });
    await Survey.updateOne({ _id: locationSurvey._id }, { $inc: { questionCount: 1 } });

    const { deviceSecret } = await activateTabletByDeviceCode('REG-TAB-01');
    const res = await getSurvey(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.survey.title).toBe('Registrar Main Counter Kiosk Survey');
    expect(res.body.data.questions.length).toBe(1);
  });

  it('never exposes an unpublished survey — a draft department survey is skipped in favor of Global', async () => {
    const draft = await Survey.findOne({ title: 'Library Services Feedback' });
    expect(draft.isPublished).toBe(false);

    const { deviceSecret } = await activateTabletByDeviceCode('LIB-TAB-02');
    const res = await getSurvey(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.survey.title).not.toBe('Library Services Feedback');
    expect(res.body.data.survey.title).toBe('General Service Feedback');
  });

  it('never exposes an archived survey — falls through as if it did not exist', async () => {
    const location = await Location.findOne({ code: 'LIB-LOC-01' });
    const department = await Department.findOne({ code: 'LIB' });

    const archivedLocationSurvey = await Survey.create({
      title: 'Archived Library Counter Survey',
      departmentId: department._id,
      locationId: location._id,
      isPublished: true,
      isArchived: true,
    });
    await Question.create({
      surveyId: archivedLocationSurvey._id,
      questionText: 'Should never be served to a tablet.',
      questionType: 'rating',
      required: true,
      order: 1,
    });

    const { deviceSecret } = await activateTabletByDeviceCode('LIB-TAB-01');
    const res = await getSurvey(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(200);
    expect(res.body.data.survey.title).not.toBe('Archived Library Counter Survey');
  });

  it('returns 404 when no published survey exists at any level for the tablet', async () => {
    await Survey.updateMany({ isPublished: true }, { $set: { isArchived: true } });

    const { deviceSecret } = await activateTabletByDeviceCode('REG-TAB-02');
    const res = await getSurvey(deviceAuthHeader(deviceSecret));

    expect(res.status).toBe(404);
  });
});
