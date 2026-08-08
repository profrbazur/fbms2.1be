import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import User from '../../src/models/User.js';
import Personnel from '../../src/models/Personnel.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const createPersonnel = (token, body) =>
  request(app)
    .post('/api/v1/personnel')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const patchPersonnel = (token, id, body) =>
  request(app)
    .patch(`/api/v1/personnel/${id}`)
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

let roles;
let registrarDept;
let libraryDept;
let superAdminUser;
let libraryStaff3User;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
  registrarDept = await Department.findOne({ code: 'REG' });
  libraryDept = await Department.findOne({ code: 'LIB' });
  superAdminUser = await User.findOne({ email: 'superadmin@fbms.test' });
  libraryStaff3User = await User.findOne({ email: 'library.staff3@fbms.test' });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/personnel', () => {
  it('allows Super Admin to create a valid unlinked personnel record', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9001',
      firstName: 'Test',
      lastName: 'Unlinked',
      email: 'test.unlinked@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.personnel.userId).toBeNull();
    expect(res.body.data.personnel.fullName).toBe('Test Unlinked');
  });

  it('allows Super Admin to create a valid linked personnel record', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9002',
      firstName: 'Test',
      lastName: 'Linked',
      email: 'test.linked@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
      userId: superAdminUser._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.personnel.userId).toBe(superAdminUser._id.toString());
  });

  it('rejects non-Super Admin creation with 403', async () => {
    const res = await createPersonnel(roles.registrarHead.token, {
      employeeNumber: 'REG-9003',
      firstName: 'Should',
      lastName: 'Fail',
      email: 'should.fail@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate employee number with 409', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'reg-0001',
      firstName: 'Dup',
      lastName: 'EmployeeNumber',
      email: 'dup.employee@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('rejects a duplicate personnel email with 409', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9004',
      firstName: 'Dup',
      lastName: 'Email',
      email: 'miguel.santos@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9005',
      firstName: 'Bad',
      lastName: 'Email',
      email: 'not-an-email',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await createPersonnel(roles.superAdmin.token, { position: 'Incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'employeeNumber')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'firstName')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'lastName')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
    expect(res.body.errors.some((e) => e.field === 'departmentId')).toBe(true);
  });

  it('rejects an invalid (nonexistent) department with 400', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9006',
      firstName: 'Bad',
      lastName: 'Department',
      email: 'bad.department@fbms.test',
      position: 'Registrar Staff',
      departmentId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an inactive department with 400', async () => {
    const inactiveDept = await Department.create({
      name: 'Inactive For Personnel Test',
      code: 'INACT2',
      isActive: false,
    });

    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9007',
      firstName: 'Inactive',
      lastName: 'Department',
      email: 'inactive.department@fbms.test',
      position: 'Registrar Staff',
      departmentId: inactiveDept._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent linked user with 400', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9008',
      firstName: 'No',
      lastName: 'SuchUser',
      email: 'no.suchuser@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
      userId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an inactive linked user with 400', async () => {
    await User.updateOne({ email: 'library.staff2@fbms.test' }, { $set: { isActive: false } });
    const inactiveUser = await User.findOne({ email: 'library.staff2@fbms.test' });

    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'LIB-9001',
      firstName: 'Inactive',
      lastName: 'User',
      email: 'inactive.user@fbms.test',
      position: 'Library Staff',
      departmentId: libraryDept._id.toString(),
      userId: inactiveUser._id.toString(),
    });
    expect(res.status).toBe(400);

    await User.updateOne({ email: 'library.staff2@fbms.test' }, { $set: { isActive: true } });
  });

  it('rejects a user already linked to another personnel record with 409', async () => {
    const registrarHeadUser = await User.findOne({ email: 'registrar.head@fbms.test' });

    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9009',
      firstName: 'Already',
      lastName: 'Linked',
      email: 'already.linked@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
      userId: registrarHeadUser._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('rejects unknown fields with 400 and does not persist them', async () => {
    const res = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9010',
      firstName: 'Unknown',
      lastName: 'Field',
      email: 'unknown.field@fbms.test',
      position: 'Registrar Staff',
      departmentId: registrarDept._id.toString(),
      notARealField: 'hacker value',
    });

    expect(res.status).toBe(400);

    const persisted = await Personnel.findOne({ employeeNumber: 'REG-9010' });
    expect(persisted).toBeNull();
  });
});

describe('PATCH /api/v1/personnel/:id', () => {
  it('allows Super Admin to update approved fields', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0003' });

    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      position: 'Senior Registrar Staff',
      contactNumber: '+63 917 555 1234',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.position).toBe('Senior Registrar Staff');
  });

  it('rejects a non-Super Admin update with 403', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0002' });

    const res = await patchPersonnel(roles.registrarHead.token, target._id.toString(), {
      position: 'Should Not Apply',
    });
    expect(res.status).toBe(403);
  });

  it('supports activation and deactivation', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0003' });

    const deactivateRes = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      isActive: false,
    });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.personnel.isActive).toBe(false);

    const activateRes = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      isActive: true,
    });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.personnel.isActive).toBe(true);
  });

  it('returns 404 for a nonexistent personnel id', async () => {
    const res = await patchPersonnel(roles.superAdmin.token, '507f1f77bcf86cd799439011', {
      position: 'Nope',
    });
    expect(res.status).toBe(404);
  });

  it('handles an invalid id safely with 404', async () => {
    const res = await patchPersonnel(roles.superAdmin.token, 'not-a-valid-id', {
      position: 'Nope',
    });
    expect(res.status).toBe(404);
  });

  it('rejects unknown fields with 400', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0003' });
    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      notARealField: true,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate personnel email on update with 409', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0003' });
    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      email: 'miguel.santos@fbms.test',
    });
    expect(res.status).toBe(409);
  });

  it('allows unlinking a personnel record from its user', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0004' });
    expect(target.userId).not.toBeNull();

    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      userId: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.userId).toBeNull();
    // library.staff3's user is now free — reused by later tests below to
    // exercise a real department-compatible link, since the seeder
    // pre-links every other department-scoped user.
  });

  it('rejects linking a user from an incompatible department with 409', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'REG-0004' });

    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      userId: libraryStaff3User._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('allows linking a personnel record to a compatible, unlinked user', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0004' });

    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      userId: libraryStaff3User._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.userId).toBe(libraryStaff3User._id.toString());
  });

  it('rejects linking a user already linked to another personnel record with 409', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0003' });
    const libraryHeadUser = await User.findOne({ email: 'library.head@fbms.test' });

    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      userId: libraryHeadUser._id.toString(),
    });
    expect(res.status).toBe(409);
  });

  it('rejects a department change that would make the linked user incompatible', async () => {
    const target = await Personnel.findOne({ employeeNumber: 'LIB-0002' });

    const res = await patchPersonnel(roles.superAdmin.token, target._id.toString(), {
      departmentId: registrarDept._id.toString(),
    });
    expect(res.status).toBe(409);

    const unchanged = await Personnel.findById(target._id);
    expect(unchanged.departmentId.toString()).toBe(libraryDept._id.toString());
  });

  it('allows a department change when there is no linked user (or the link stays compatible)', async () => {
    const created = await createPersonnel(roles.superAdmin.token, {
      employeeNumber: 'REG-9011',
      firstName: 'Movable',
      lastName: 'Record',
      email: 'movable.record@fbms.test',
      position: 'Staff',
      departmentId: registrarDept._id.toString(),
    });
    const id = created.body.data.personnel._id;

    const res = await patchPersonnel(roles.superAdmin.token, id, {
      departmentId: libraryDept._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.personnel.departmentId).toBe(libraryDept._id.toString());
  });
});
