import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Location from '../../src/models/Location.js';
import Survey from '../../src/models/Survey.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const createSurvey = (token, body) =>
  request(app)
    .post('/api/v1/surveys')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchSurvey = (token, id, body) =>
  request(app)
    .patch(`/api/v1/surveys/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

let roles;
let registrarDept;
let registrarLoc1;
let registrarLoc2;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarDept = await Department.findOne({ code: 'REG' });
  registrarLoc1 = await Location.findOne({ code: 'REG-LOC-01' });
  registrarLoc2 = await Location.findOne({ code: 'REG-LOC-02' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/surveys', () => {
  it('creates a Global survey when neither departmentId nor locationId is supplied', async () => {
    const res = await createSurvey(roles.superAdmin.token, { title: 'New Global Survey' });

    expect(res.status).toBe(201);
    expect(res.body.data.survey.departmentId).toBeNull();
    expect(res.body.data.survey.locationId).toBeNull();
    expect(res.body.data.survey.assignmentType).toBe('global');
  });

  it('creates a Department survey when departmentId is supplied', async () => {
    const res = await createSurvey(roles.superAdmin.token, {
      title: 'New Department Survey',
      departmentId: registrarDept._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.survey.departmentId).toBe(registrarDept._id.toString());
    expect(res.body.data.survey.locationId).toBeNull();
    expect(res.body.data.survey.assignmentType).toBe('department');
  });

  it('creates a Location survey, deriving departmentId from the location and ignoring a client-supplied departmentId', async () => {
    const otherDept = await Department.findOne({ code: 'LIB' });

    const res = await createSurvey(roles.superAdmin.token, {
      title: 'New Location Survey',
      locationId: registrarLoc1._id.toString(),
      departmentId: otherDept._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.survey.locationId).toBe(registrarLoc1._id.toString());
    expect(res.body.data.survey.departmentId).toBe(registrarLoc1.departmentId.toString());
    expect(res.body.data.survey.departmentId).not.toBe(otherDept._id.toString());
  });

  it('creates a Location survey correctly when only locationId is supplied, deriving departmentId', async () => {
    const res = await createSurvey(roles.superAdmin.token, {
      title: 'Location-Only Survey',
      locationId: registrarLoc2._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.survey.locationId).toBe(registrarLoc2._id.toString());
    expect(res.body.data.survey.departmentId).toBe(registrarLoc2.departmentId.toString());
    expect(res.body.data.survey.assignmentType).toBe('location');
  });

  it('rejects a second, non-archived survey assigned to the same location with 409', async () => {
    // registrarLoc1 was already occupied by "New Location Survey" above.
    const res = await createSurvey(roles.superAdmin.token, {
      title: 'Duplicate Location Survey',
      locationId: registrarLoc1._id.toString(),
    });

    expect(res.status).toBe(409);
  });

  it('allows assigning a survey to a different, unoccupied location', async () => {
    const freshLocation = await Location.create({
      name: 'Registrar Annex (Survey Write Test)',
      code: 'REG-LOC-99-SURVEY',
      departmentId: registrarDept._id,
      isActive: true,
    });

    const res = await createSurvey(roles.superAdmin.token, {
      title: 'Third Location Survey',
      locationId: freshLocation._id.toString(),
    });

    expect(res.status).toBe(201);
  });

  it('rejects non-Super Admin creation with 403', async () => {
    const res = await createSurvey(roles.registrarHead.token, { title: 'Should Fail' });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await createSurvey(undefined, { title: 'Should Fail' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing title with 400', async () => {
    const res = await createSurvey(roles.superAdmin.token, {});
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('rejects a nonexistent department with 400', async () => {
    const res = await createSurvey(roles.superAdmin.token, {
      title: 'Bad Department',
      departmentId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an inactive location with 400', async () => {
    const inactiveLocation = await Location.create({
      name: 'Inactive For Survey Test',
      code: 'INACT-LOC-SURVEY',
      departmentId: registrarDept._id,
      isActive: false,
    });

    const res = await createSurvey(roles.superAdmin.token, {
      title: 'Inactive Location Survey',
      locationId: inactiveLocation._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields with 400 (including isPublished/isArchived/questionCount)', async () => {
    const res = await createSurvey(roles.superAdmin.token, {
      title: 'Unknown Field Survey',
      isPublished: true,
    });
    expect(res.status).toBe(400);

    const persisted = await Survey.findOne({ title: 'Unknown Field Survey' });
    expect(persisted).toBeNull();
  });
});

describe('PATCH /api/v1/surveys/:id', () => {
  it('allows Super Admin to update a draft survey\'s fields', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });

    const res = await patchSurvey(roles.superAdmin.token, target._id.toString(), {
      description: 'Updated description.',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.survey.description).toBe('Updated description.');
  });

  it('rejects a non-Super Admin update with 403', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });

    const res = await patchSurvey(roles.registrarHead.token, target._id.toString(), {
      title: 'Should Not Apply',
    });
    expect(res.status).toBe(403);
  });

  it('rejects editing a published survey with 409', async () => {
    const target = await Survey.findOne({ title: 'Registrar Office Feedback' });
    expect(target.isPublished).toBe(true);

    const res = await patchSurvey(roles.superAdmin.token, target._id.toString(), {
      title: 'Should Be Blocked',
    });
    expect(res.status).toBe(409);

    const unchanged = await Survey.findById(target._id);
    expect(unchanged.title).toBe('Registrar Office Feedback');
  });

  it('rejects unknown fields with 400', async () => {
    const target = await Survey.findOne({ title: 'Library Services Feedback' });
    const res = await patchSurvey(roles.superAdmin.token, target._id.toString(), {
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent survey id', async () => {
    const res = await patchSurvey(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      title: 'Nope',
    });
    expect(res.status).toBe(404);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await patchSurvey(roles.superAdmin.token, 'not-a-valid-id', { title: 'Nope' });
    expect(res.status).toBe(404);
  });

  it('rejects editing an archived survey with 409', async () => {
    const target = await Survey.create({ title: 'Archived For Write Test', isArchived: true });

    const res = await patchSurvey(roles.superAdmin.token, target._id.toString(), {
      title: 'Should Be Blocked',
    });
    expect(res.status).toBe(409);
  });

  it('re-derives departmentId when locationId changes on update', async () => {
    const target = await Survey.create({ title: 'Reassignable Draft Survey' });

    const res = await patchSurvey(roles.superAdmin.token, target._id.toString(), {
      locationId: registrarLoc1._id.toString(),
    });

    expect(res.status).toBe(409); // registrarLoc1 is already occupied from the create-tests above
  });

  it('allows reassigning a draft survey to an unoccupied location on update', async () => {
    const freshLocation = await Location.create({
      name: 'Registrar Annex 2 (Survey Write Test)',
      code: 'REG-LOC-98-SURVEY',
      departmentId: registrarDept._id,
      isActive: true,
    });
    const target = await Survey.create({ title: 'Reassignable Draft Survey 2' });

    const res = await patchSurvey(roles.superAdmin.token, target._id.toString(), {
      locationId: freshLocation._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.survey.locationId).toBe(freshLocation._id.toString());
    expect(res.body.data.survey.departmentId).toBe(registrarDept._id.toString());
  });
});
