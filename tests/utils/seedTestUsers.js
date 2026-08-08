import Department from '../../src/models/Department.js';
import User from '../../src/models/User.js';
import OrganizationSettings from '../../src/models/OrganizationSettings.js';
import Location from '../../src/models/Location.js';
import Personnel from '../../src/models/Personnel.js';
import Tablet from '../../src/models/Tablet.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import FeedbackAnswer from '../../src/models/FeedbackAnswer.js';
import AuditLog from '../../src/models/AuditLog.js';
import { seedUsers, DEFAULT_PASSWORD } from '../../src/seeders/userSeeder.js';
import {
  seedOrganizationSettings,
  seedLocations,
} from '../../src/seeders/organizationSeeder.js';
import { seedPersonnel } from '../../src/seeders/personnelSeeder.js';
import { seedTablets } from '../../src/seeders/tabletSeeder.js';
import { seedSurveys } from '../../src/seeders/surveySeeder.js';
import { seedFeedback } from '../../src/seeders/feedbackSeeder.js';
import { connectTestDb, clearCollections } from './testDb.js';

/**
 * Resets the test database to a known, freshly-seeded state. Safe to
 * call from any test file's beforeAll — each file gets the same 9
 * users/2 departments/1 organization settings record/4 locations/8
 * personnel records/4 tablets/3 surveys/10 feedback sessions regardless
 * of what other files did, satisfying "tests must not depend on
 * execution order."
 */
export async function resetAndSeed() {
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
    AuditLog,
  );
  await seedUsers();
  await seedOrganizationSettings();
  await seedLocations();
  await seedPersonnel();
  await seedTablets();
  await seedSurveys();
  await seedFeedback();
}

export { DEFAULT_PASSWORD };
