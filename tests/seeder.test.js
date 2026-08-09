import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import Department from '../src/models/Department.js';
import User from '../src/models/User.js';
import OrganizationSettings from '../src/models/OrganizationSettings.js';
import Location from '../src/models/Location.js';
import Personnel from '../src/models/Personnel.js';
import Tablet from '../src/models/Tablet.js';
import Survey from '../src/models/Survey.js';
import Question from '../src/models/Question.js';
import FeedbackSession from '../src/models/FeedbackSession.js';
import FeedbackAnswer from '../src/models/FeedbackAnswer.js';
import { seedUsers, DEFAULT_PASSWORD } from '../src/seeders/userSeeder.js';
import {
  seedOrganizationSettings,
  seedLocations,
} from '../src/seeders/organizationSeeder.js';
import { seedPersonnel } from '../src/seeders/personnelSeeder.js';
import { seedTablets } from '../src/seeders/tabletSeeder.js';
import { seedSurveys } from '../src/seeders/surveySeeder.js';
import { seedFeedback } from '../src/seeders/feedbackSeeder.js';
import { activateTablet } from '../src/services/mobileService.js';
import { connectTestDb, disconnectTestDb, clearCollections } from './utils/testDb.js';

beforeAll(async () => {
  await connectTestDb();
  await clearCollections(
    User,
    Department,
    OrganizationSettings,
    Location,
    Personnel,
    Tablet,
    Survey,
    Question,
    FeedbackSession,
    FeedbackAnswer,
  );
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('userSeeder', () => {
  it('creates exactly 2 departments and 11 users (9 original + 2 V2.2 Senior Leadership)', async () => {
    const result = await seedUsers();

    expect(result.departmentCount).toBe(2);
    expect(result.userCount).toBe(11);
    expect(await Department.countDocuments()).toBe(2);
    expect(await User.countDocuments()).toBe(11);
  });

  it('is idempotent — running it again does not create duplicates', async () => {
    await seedUsers();
    await seedUsers();

    expect(await Department.countDocuments()).toBe(2);
    expect(await User.countDocuments()).toBe(11);
  });

  it('has no duplicate email addresses', async () => {
    const users = await User.find().select('email');
    const emails = users.map((u) => u.email);

    expect(new Set(emails).size).toBe(emails.length);
  });

  it('has no duplicate department codes', async () => {
    const departments = await Department.find().select('code');
    const codes = departments.map((d) => d.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('stores every password as a bcrypt hash, never in plaintext', async () => {
    const users = await User.find().select('+passwordHash');

    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(user.passwordHash).not.toBe(DEFAULT_PASSWORD);
      expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      await expect(bcrypt.compare(DEFAULT_PASSWORD, user.passwordHash)).resolves.toBe(
        true,
      );
    }
  });

  it('produces the expected role/department distribution', async () => {
    const byRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(byRole.map((r) => [r._id, r.count]));

    expect(counts.super_admin).toBe(1);
    expect(counts.department_head).toBe(2);
    expect(counts.personnel).toBe(6);
    expect(counts.senior_leadership).toBe(2);
  });
});

describe('organizationSeeder', () => {
  it('creates exactly one organization settings record', async () => {
    await seedOrganizationSettings();

    expect(await OrganizationSettings.countDocuments()).toBe(1);
  });

  it('is idempotent — running it again does not create a second singleton record', async () => {
    await seedOrganizationSettings();
    await seedOrganizationSettings();
    await seedOrganizationSettings();

    expect(await OrganizationSettings.countDocuments()).toBe(1);
  });

  it('seeds locations distributed across Registrar and Library, idempotently', async () => {
    const firstRun = await seedLocations();
    await seedLocations();
    await seedLocations();

    const locations = await Location.find().populate('departmentId', 'code');
    const departmentCodes = new Set(locations.map((l) => l.departmentId.code));

    expect(firstRun.locationCount).toBeGreaterThan(0);
    expect(await Location.countDocuments()).toBe(firstRun.locationCount);
    expect(departmentCodes.has('REG')).toBe(true);
    expect(departmentCodes.has('LIB')).toBe(true);
  });

  it('has no duplicate location codes', async () => {
    const locations = await Location.find().select('code');
    const codes = locations.map((l) => l.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('personnelSeeder', () => {
  it('creates exactly 8 personnel records (2 department heads + 6 personnel-role staff)', async () => {
    const result = await seedPersonnel();

    expect(result.personnelCount).toBe(8);
    expect(await Personnel.countDocuments()).toBe(8);
  });

  it('is idempotent — running it again does not create duplicates', async () => {
    await seedPersonnel();
    await seedPersonnel();

    expect(await Personnel.countDocuments()).toBe(8);
  });

  it('does not create a Personnel record for the Super Admin', async () => {
    const superAdmin = await User.findOne({ email: 'superadmin@fbms.test' });
    const linked = await Personnel.findOne({ userId: superAdmin._id });

    expect(linked).toBeNull();
  });

  it('links each personnel record to its corresponding seeded user, without modifying that user', async () => {
    const beforeUsers = await User.find().select('email passwordHash isActive').lean();

    await seedPersonnel();

    const afterUsers = await User.find().select('email passwordHash isActive').lean();
    expect(afterUsers).toEqual(beforeUsers);

    const registrarHead = await User.findOne({ email: 'registrar.head@fbms.test' });
    const linkedPersonnel = await Personnel.findOne({ employeeNumber: 'REG-0001' });

    expect(linkedPersonnel.userId.toString()).toBe(registrarHead._id.toString());
  });

  it('has no duplicate employee numbers or duplicate userId links', async () => {
    const personnel = await Personnel.find().select('employeeNumber userId');
    const employeeNumbers = personnel.map((p) => p.employeeNumber);
    const linkedUserIds = personnel.filter((p) => p.userId).map((p) => p.userId.toString());

    expect(new Set(employeeNumbers).size).toBe(employeeNumbers.length);
    expect(new Set(linkedUserIds).size).toBe(linkedUserIds.length);
  });

  it('exactly eleven authentication users remain after seeding personnel', async () => {
    expect(await User.countDocuments()).toBe(11);
  });
});

describe('tabletSeeder', () => {
  it('creates exactly 4 tablets distributed across Registrar and Library', async () => {
    const result = await seedTablets();

    expect(result.tabletCount).toBe(4);
    expect(await Tablet.countDocuments()).toBe(4);

    const tablets = await Tablet.find().populate('departmentId', 'code');
    const departmentCodes = new Set(tablets.map((t) => t.departmentId.code));
    expect(departmentCodes.has('REG')).toBe(true);
    expect(departmentCodes.has('LIB')).toBe(true);
  });

  it('is idempotent — running it again does not create duplicates', async () => {
    await seedTablets();
    await seedTablets();

    expect(await Tablet.countDocuments()).toBe(4);
  });

  it('does not rotate an existing tablet activation token on re-seed', async () => {
    const before = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    await seedTablets();
    const after = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });

    expect(after.activationToken).toBe(before.activationToken);
  });

  it('has no duplicate device codes or activation tokens', async () => {
    const tablets = await Tablet.find().select('deviceCode activationToken');
    const deviceCodes = tablets.map((t) => t.deviceCode);
    const tokens = tablets.map((t) => t.activationToken);

    expect(new Set(deviceCodes).size).toBe(deviceCodes.length);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('every activation token matches the TAB-XXXXXXXX format', async () => {
    const tablets = await Tablet.find().select('activationToken');

    for (const tablet of tablets) {
      expect(tablet.activationToken).toMatch(/^TAB-[A-Z0-9]{8}$/);
    }
  });

  it('reseeding preserves an already-activated tablet\'s Device Secret and consumed marker (P5.1)', async () => {
    const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    await activateTablet(tablet.activationToken);

    const activated = await Tablet.findById(tablet._id).select('+deviceSecretHash');
    expect(activated.deviceSecretHash).toBeTruthy();
    expect(activated.activationConsumedAt).toBeInstanceOf(Date);

    await seedTablets();
    await seedTablets();

    const afterReseed = await Tablet.findById(tablet._id).select('+deviceSecretHash');
    expect(afterReseed.deviceSecretHash).toBe(activated.deviceSecretHash);
    expect(afterReseed.activationConsumedAt.getTime()).toBe(activated.activationConsumedAt.getTime());
  });
});

describe('surveySeeder', () => {
  it('creates exactly 3 surveys (Global, Registrar, Library) with realistic questions', async () => {
    const result = await seedSurveys();

    expect(result.surveyCount).toBe(3);
    expect(await Survey.countDocuments()).toBe(3);
    expect(result.questionCount).toBeGreaterThan(0);
    expect(await Question.countDocuments()).toBe(result.questionCount);
  });

  it('is idempotent — running it again does not create duplicate surveys or questions', async () => {
    const first = await seedSurveys();
    await seedSurveys();
    await seedSurveys();

    expect(await Survey.countDocuments()).toBe(3);
    expect(await Question.countDocuments()).toBe(first.questionCount);
  });

  it('seeds one Global, one Registrar, and one Library survey', async () => {
    const global = await Survey.findOne({ title: 'General Service Feedback' });
    const registrar = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const library = await Survey.findOne({ title: 'Library Services Feedback' });

    expect(global.departmentId).toBeNull();
    expect(global.locationId).toBeNull();

    const registrarDept = await Department.findOne({ code: 'REG' });
    const libraryDept = await Department.findOne({ code: 'LIB' });

    expect(registrar.departmentId.toString()).toBe(registrarDept._id.toString());
    expect(library.departmentId.toString()).toBe(libraryDept._id.toString());
  });

  it('leaves the Library survey in a draft (unpublished) state and publishes the others', async () => {
    const global = await Survey.findOne({ title: 'General Service Feedback' });
    const registrar = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const library = await Survey.findOne({ title: 'Library Services Feedback' });

    expect(global.isPublished).toBe(true);
    expect(registrar.isPublished).toBe(true);
    expect(library.isPublished).toBe(false);
  });

  it('keeps each survey\'s questionCount accurate after re-seeding', async () => {
    const survey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const actualQuestionCount = await Question.countDocuments({ surveyId: survey._id });

    expect(survey.questionCount).toBe(actualQuestionCount);
  });

  it('preserves question order and question-type variety per survey', async () => {
    const survey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });

    expect(questions.map((q) => q.order)).toEqual([1, 2, 3, 4]);
    const multipleChoice = questions.find((q) => q.questionType === 'multiple_choice');
    expect(multipleChoice.options.length).toBeGreaterThanOrEqual(2);
  });
});

describe('feedbackSeeder', () => {
  it('creates exactly 10 feedback sessions with answers only against published surveys', async () => {
    const result = await seedFeedback();

    expect(result.sessionCount).toBe(10);
    expect(await FeedbackSession.countDocuments()).toBe(10);
    expect(result.answerCount).toBeGreaterThan(0);
    expect(await FeedbackAnswer.countDocuments()).toBe(result.answerCount);

    const draftSurvey = await Survey.findOne({ title: 'Library Services Feedback' });
    const sessionsForDraftSurvey = await FeedbackSession.countDocuments({ surveyId: draftSurvey._id });
    expect(sessionsForDraftSurvey).toBe(0);
  });

  it('is idempotent — running it again does not create duplicate sessions or answers', async () => {
    const first = await seedFeedback();
    await seedFeedback();
    await seedFeedback();

    expect(await FeedbackSession.countDocuments()).toBe(10);
    expect(await FeedbackAnswer.countDocuments()).toBe(first.answerCount);
  });

  it('has no duplicate reference codes', async () => {
    const sessions = await FeedbackSession.find().select('referenceCode');
    const codes = sessions.map((s) => s.referenceCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('derives departmentId from the tablet\'s own department, not the survey\'s', async () => {
    const registrarDept = await Department.findOne({ code: 'REG' });
    const libraryDept = await Department.findOne({ code: 'LIB' });
    const libraryTablet = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });

    const sessionFromLibraryTablet = await FeedbackSession.findOne({ tabletId: libraryTablet._id });

    expect(sessionFromLibraryTablet.departmentId.toString()).toBe(libraryDept._id.toString());
    expect(sessionFromLibraryTablet.locationId.toString()).toBe(libraryTablet.locationId.toString());

    const departmentCounts = await FeedbackSession.aggregate([
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]);
    const countByDept = Object.fromEntries(departmentCounts.map((d) => [d._id.toString(), d.count]));

    expect(countByDept[registrarDept._id.toString()]).toBe(8);
    expect(countByDept[libraryDept._id.toString()]).toBe(2);
  });

  it('computes durationSeconds from submittedAt/completedAt, never drifting', async () => {
    const sessions = await FeedbackSession.find();

    for (const session of sessions) {
      const expectedDuration = Math.round(
        (session.completedAt.getTime() - session.submittedAt.getTime()) / 1000,
      );
      expect(session.durationSeconds).toBe(expectedDuration);
    }
  });

  it('stores answers matching each question\'s type, validated the same way a mobile submission would be', async () => {
    const registrarSurvey = await Survey.findOne({ title: 'Registrar Office Feedback' });
    const multipleChoiceQuestion = await Question.findOne({
      surveyId: registrarSurvey._id,
      questionType: 'multiple_choice',
    });
    const answer = await FeedbackAnswer.findOne({ questionId: multipleChoiceQuestion._id });

    expect(answer.questionType).toBe('multiple_choice');
    expect(multipleChoiceQuestion.options).toContain(answer.answer);
  });
});
