import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDatabase } from '../config/database.js';
import FeedbackSession from '../models/FeedbackSession.js';
import FeedbackAnswer from '../models/FeedbackAnswer.js';
import { seedUsers } from './userSeeder.js';
import { seedOrganizationSettings, seedBuildings, seedLocations } from './organizationSeeder.js';
import { seedPersonnel } from './personnelSeeder.js';
import { seedTablets } from './tabletSeeder.js';
import { seedSurveys } from './surveySeeder.js';
import { seedFeedback, SEEDED_REFERENCE_CODES } from './feedbackSeeder.js';

/**
 * V2 Development Dataset — see backend/dev-data/README.md.
 *
 * This is the small, deterministic dataset for active V2.3+ development
 * and QA (as distinct from `backend/demo-data/`'s large Canonical
 * Demonstration Dataset). It reuses the exact same Department/User/
 * Location/Personnel/Tablet/Survey/Feedback definitions `npm run seed`
 * already seeds (userSeeder.js/organizationSeeder.js/personnelSeeder.js/
 * tabletSeeder.js/surveySeeder.js/feedbackSeeder.js) — those seeders
 * were already small and deterministic before this phase, so this
 * script does not duplicate their data definitions (see
 * backend/dev-data/README.md's Dataset Strategy section for why).
 *
 * The one thing this script adds beyond `npm run seed`: it first strips
 * any FeedbackSession/FeedbackAnswer records OUTSIDE the small baseline
 * (i.e. a previously loaded 3,000-session canonical/demo dataset, or
 * stray mobile submissions) so the database ends up in the actual small
 * V2 Development Dataset state, not the small state plus leftover bulk
 * data. It never touches Department/User/Location/Personnel/Tablet/
 * Survey records beyond the same idempotent upserts `npm run seed`
 * already performs — those are never bulk-inflated by canonical:load or
 * normal read-only app usage, so there is nothing to strip there.
 */

/**
 * Mirrors loadCanonicalDataset.js's own guard: this script deletes
 * FeedbackSession/FeedbackAnswer records and must only ever run against
 * the development database, never a database whose name suggests it is
 * the automated test database (whose exact record counts are asserted
 * on by the backend test suite via its own isolated seeding).
 */
function assertNotTestDatabase() {
  const dbNameMatch = env.mongoUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch?.[1];

  if (dbName && dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to load the V2 development dataset: MONGO_URI resolves to "${dbName}", ` +
        'which looks like a test database. This script must only run against the ' +
        'development database (see docs/MONGODB_HANDOFF.md).',
    );
  }
}

export async function seedDevelopmentDataset() {
  const staleSessions = await FeedbackSession.find({
    referenceCode: { $nin: SEEDED_REFERENCE_CODES },
  }).select('_id');
  const staleSessionIds = staleSessions.map((session) => session._id);

  let removedAnswers = 0;
  let removedSessions = 0;

  if (staleSessionIds.length > 0) {
    const answerResult = await FeedbackAnswer.deleteMany({
      feedbackSessionId: { $in: staleSessionIds },
    });
    removedAnswers = answerResult.deletedCount ?? 0;

    const sessionResult = await FeedbackSession.deleteMany({
      _id: { $in: staleSessionIds },
    });
    removedSessions = sessionResult.deletedCount ?? 0;
  }

  const userResult = await seedUsers();
  await seedOrganizationSettings();
  const buildingResult = await seedBuildings();
  const locationResult = await seedLocations();
  const personnelResult = await seedPersonnel();
  const tabletResult = await seedTablets();
  const surveyResult = await seedSurveys();
  const feedbackResult = await seedFeedback();

  return {
    removedStaleSessions: removedSessions,
    removedStaleAnswers: removedAnswers,
    departmentCount: userResult.departmentCount,
    userCount: userResult.userCount,
    buildingCount: buildingResult.buildingCount,
    locationCount: locationResult.locationCount,
    personnelCount: personnelResult.personnelCount,
    tabletCount: tabletResult.tabletCount,
    surveyCount: surveyResult.surveyCount,
    questionCount: surveyResult.questionCount,
    sessionCount: feedbackResult.sessionCount,
    answerCount: feedbackResult.answerCount,
  };
}

async function run() {
  assertNotTestDatabase();
  await connectDatabase();

  const result = await seedDevelopmentDataset();

  console.log('V2 Development Dataset loaded.');
  if (result.removedStaleSessions > 0 || result.removedStaleAnswers > 0) {
    console.log(
      `Removed ${result.removedStaleSessions} stale feedback session(s) and ` +
        `${result.removedStaleAnswers} stale answer(s) outside the small baseline ` +
        '(e.g. a previously loaded canonical/demo dataset).',
    );
  }
  console.log(`Departments: ${result.departmentCount}, Users: ${result.userCount}`);
  console.log(`Buildings: ${result.buildingCount}`);
  console.log(`Locations: ${result.locationCount}, Personnel: ${result.personnelCount}, Tablets: ${result.tabletCount}`);
  console.log(`Surveys: ${result.surveyCount} (${result.questionCount} questions)`);
  console.log(`Feedback sessions: ${result.sessionCount} (${result.answerCount} answers)`);

  await mongoose.disconnect();
  process.exit(0);
}

// Only run the CLI entrypoint when this file is executed directly (`node
// src/seeders/seedDevelopmentDataset.js` / `npm run seed:development`) —
// same convention as generateCanonicalDataset.js/loadCanonicalDataset.js.
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMainModule) {
  run().catch((error) => {
    console.error('Loading the V2 development dataset failed:', error.message);
    process.exit(1);
  });
}
