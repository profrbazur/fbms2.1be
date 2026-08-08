import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDatabase } from '../config/database.js';
import Survey from '../models/Survey.js';
import Question from '../models/Question.js';
import Tablet from '../models/Tablet.js';
import FeedbackSession from '../models/FeedbackSession.js';
import FeedbackAnswer from '../models/FeedbackAnswer.js';
import { validateAnswerForQuestion } from '../services/feedbackService.js';

/**
 * P9.1 — loads the portable dataset generateCanonicalDataset.js already
 * wrote to `backend/demo-data/feedback-sessions.json` into the database
 * `MONGO_URI` currently points at (the development database per
 * docs/MONGODB_HANDOFF.md — this script is a plain Node script reusing
 * the exact same connectDatabase()/env.js the rest of the backend uses,
 * never a hardcoded connection string). Looks up every Survey/Tablet/
 * Question by its business key (title/deviceCode/questionText), the
 * same convention feedbackSeeder.js already established, so this file
 * has no dependency on any specific database's ObjectIds — it is safe
 * to run against any FBMS database that already has the standard
 * seeded Surveys/Tablets (i.e. has already run `npm run seed`).
 *
 * Idempotent and reloadable: FeedbackSession upserts by `referenceCode`,
 * FeedbackAnswer upserts by { feedbackSessionId, questionId } — running
 * this script again (e.g. a future "Reload Canonical Dataset" feature,
 * P9.2) simply re-applies the same deterministic $set values, it never
 * duplicates records. Uses bulkWrite in batches rather than one
 * findOneAndUpdate per record (feedbackSeeder.js's own approach) purely
 * for throughput at this dataset's scale (3,000 sessions / ~10,700
 * answers) against a shared Atlas free-tier cluster.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DATA_DIR = path.resolve(__dirname, '../../demo-data');
const BATCH_SIZE = 500;

/**
 * Mirrors tests/setup/loadTestEnv.js's own safety guard in reverse: this
 * script inserts thousands of synthetic records and must never run
 * against a database whose name suggests it's the automated test
 * database (feedback_management_test_db) — that database's record
 * counts are asserted on exactly by the backend test suite.
 */
function assertNotTestDatabase() {
  const dbNameMatch = env.mongoUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch?.[1];

  if (dbName && dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to load the canonical dataset: MONGO_URI resolves to "${dbName}", ` +
        'which looks like a test database. This script must only run against the ' +
        'development database (see docs/MONGODB_HANDOFF.md).',
    );
  }
}

export async function loadCanonicalDataset() {
  const filePath = path.join(DEMO_DATA_DIR, 'feedback-sessions.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `${filePath} does not exist. Run "npm run canonical:generate" first.`,
    );
  }
  const sessions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const surveyTitles = [...new Set(sessions.map((s) => s.surveyTitle))];
  const tabletCodes = [...new Set(sessions.map((s) => s.tabletDeviceCode))];

  const surveys = await Survey.find({ title: { $in: surveyTitles } });
  const surveyByTitle = new Map(surveys.map((s) => [s.title, s]));

  const tablets = await Tablet.find({ deviceCode: { $in: tabletCodes } });
  const tabletByCode = new Map(tablets.map((t) => [t.deviceCode, t]));

  const missingSurveys = surveyTitles.filter((title) => !surveyByTitle.has(title));
  const missingTablets = tabletCodes.filter((code) => !tabletByCode.has(code));
  if (missingSurveys.length > 0 || missingTablets.length > 0) {
    throw new Error(
      'Canonical dataset references entities that do not exist yet. ' +
        `Missing surveys: [${missingSurveys.join(', ')}]. ` +
        `Missing tablets: [${missingTablets.join(', ')}]. ` +
        'Run "npm run seed" first.',
    );
  }

  const questions = await Question.find({ surveyId: { $in: surveys.map((s) => s._id) } });
  const questionByKey = new Map(
    questions.map((q) => [`${q.surveyId.toString()}::${q.questionText}`, q]),
  );

  let skippedAnswers = 0;
  const sessionOps = sessions.map((definition) => {
    const survey = surveyByTitle.get(definition.surveyTitle);
    const tablet = tabletByCode.get(definition.tabletDeviceCode);
    const submittedAt = new Date(definition.submittedAt);
    const completedAt = new Date(definition.completedAt);
    const durationSeconds = Math.round((completedAt.getTime() - submittedAt.getTime()) / 1000);

    return {
      updateOne: {
        filter: { referenceCode: definition.referenceCode },
        update: {
          $set: {
            surveyId: survey._id,
            tabletId: tablet._id,
            locationId: tablet.locationId,
            departmentId: tablet.departmentId,
            submittedAt,
            completedAt,
            durationSeconds,
            status: 'completed',
          },
        },
        upsert: true,
      },
    };
  });

  console.log(`Upserting ${sessionOps.length} feedback sessions in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < sessionOps.length; i += BATCH_SIZE) {
    await FeedbackSession.bulkWrite(sessionOps.slice(i, i + BATCH_SIZE), { ordered: false });
  }

  const referenceCodes = sessions.map((s) => s.referenceCode);
  const persistedSessions = await FeedbackSession.find({
    referenceCode: { $in: referenceCodes },
  }).select('_id referenceCode surveyId');
  const sessionIdByReferenceCode = new Map(
    persistedSessions.map((s) => [s.referenceCode, s]),
  );

  const answerOps = [];
  for (const definition of sessions) {
    const session = sessionIdByReferenceCode.get(definition.referenceCode);
    if (!session) continue;

    for (const answerDefinition of definition.answers) {
      const question = questionByKey.get(`${session.surveyId.toString()}::${answerDefinition.questionText}`);
      if (!question) {
        skippedAnswers += 1;
        continue;
      }

      const normalizedAnswer = validateAnswerForQuestion(question, answerDefinition.answer);
      answerOps.push({
        updateOne: {
          filter: { feedbackSessionId: session._id, questionId: question._id },
          update: {
            $set: { questionType: question.questionType, answer: normalizedAnswer },
          },
          upsert: true,
        },
      });
    }
  }

  console.log(`Upserting ${answerOps.length} feedback answers in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < answerOps.length; i += BATCH_SIZE) {
    await FeedbackAnswer.bulkWrite(answerOps.slice(i, i + BATCH_SIZE), { ordered: false });
  }

  return {
    sessionCount: sessionOps.length,
    answerCount: answerOps.length,
    skippedAnswers,
  };
}

async function run() {
  assertNotTestDatabase();
  await connectDatabase();

  const result = await loadCanonicalDataset();

  console.log(
    `Loaded ${result.sessionCount} canonical feedback session(s) with ${result.answerCount} answer(s).`,
  );
  if (result.skippedAnswers > 0) {
    console.warn(`Skipped ${result.skippedAnswers} answer(s) referencing an unknown question.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

// Only run the CLI entrypoint (including its test-database safety guard
// and process.exit calls) when this file is executed directly (`node
// src/seeders/loadCanonicalDataset.js` / `npm run canonical:load`) —
// never when `loadCanonicalDataset` (above) is imported as a function by
// another module (see backend/src/services/developerPortalService.js,
// P9.2), which must reuse the plain upsert logic without inheriting a
// CLI script's own process-lifecycle side effects.
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMainModule) {
  run().catch((error) => {
    console.error('Loading canonical dataset failed:', error.message);
    process.exit(1);
  });
}
