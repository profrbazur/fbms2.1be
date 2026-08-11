import Department from '../../src/models/Department.js';
import User from '../../src/models/User.js';
import OrganizationSettings from '../../src/models/OrganizationSettings.js';
import Building from '../../src/models/Building.js';
import Location from '../../src/models/Location.js';
import Personnel from '../../src/models/Personnel.js';
import Tablet from '../../src/models/Tablet.js';
import ServiceSession from '../../src/models/ServiceSession.js';
import ServiceType from '../../src/models/ServiceType.js';
import Survey from '../../src/models/Survey.js';
import Question from '../../src/models/Question.js';
import FeedbackSession from '../../src/models/FeedbackSession.js';
import FeedbackAnswer from '../../src/models/FeedbackAnswer.js';
import AuditLog from '../../src/models/AuditLog.js';
import { seedUsers, DEFAULT_PASSWORD } from '../../src/seeders/userSeeder.js';
import {
  seedOrganizationSettings,
  seedBuildings,
  seedLocations,
} from '../../src/seeders/organizationSeeder.js';
import { seedPersonnel } from '../../src/seeders/personnelSeeder.js';
import { seedTablets } from '../../src/seeders/tabletSeeder.js';
import { seedServiceSessions } from '../../src/seeders/serviceSessionSeeder.js';
import { seedServiceTypes } from '../../src/seeders/serviceTypeSeeder.js';
import { seedSurveys } from '../../src/seeders/surveySeeder.js';
import { seedFeedback } from '../../src/seeders/feedbackSeeder.js';
import { connectTestDb, clearCollections } from './testDb.js';

/**
 * Resets the test database to a known, freshly-seeded state. Safe to
 * call from any test file's beforeAll — each file gets the same 11
 * users (9 original + 2 V2.2 Senior Leadership)/2 departments/1
 * organization settings record/5 buildings/4 locations/8 personnel
 * records/4 tablets/6 service sessions (V2.4)/3 surveys/10 feedback
 * sessions regardless of what other files did, satisfying "tests must
 * not depend on execution order." V2.6 adds 12 service types (6 per
 * department).
 */
export async function resetAndSeed() {
  await connectTestDb();
  await clearCollections(
    User,
    Department,
    OrganizationSettings,
    Building,
    Location,
    Personnel,
    Tablet,
    ServiceSession,
    ServiceType,
    Survey,
    Question,
    FeedbackSession,
    FeedbackAnswer,
    AuditLog,
  );
  await seedUsers();
  await seedOrganizationSettings();
  await seedBuildings();
  await seedLocations();
  await seedPersonnel();
  await seedTablets();
  await seedServiceSessions();
  await seedServiceTypes();
  await seedSurveys();
  await seedFeedback();
}

export { DEFAULT_PASSWORD };
