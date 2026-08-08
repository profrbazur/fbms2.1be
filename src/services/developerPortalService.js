import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import FeedbackSession from '../models/FeedbackSession.js';
import FeedbackAnswer from '../models/FeedbackAnswer.js';
import { loadCanonicalDataset } from '../seeders/loadCanonicalDataset.js';
import { ApiError } from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DATA_DIR = path.resolve(__dirname, '../../demo-data');

/**
 * The canonical baseline is exactly contiguous: feedbackSeeder.js's 10
 * hand-written samples (FB-2026-000001..000010) plus P9.1's 3,000
 * generated canonical sessions (FB-2026-000011..003010) — see
 * backend/demo-data/CANONICAL_DATASET.md. Any FeedbackSession outside that
 * range can only exist because a real POST /api/v1/mobile/feedback
 * submission created it (generateUniqueReferenceCode always continues
 * upward from the current max) — i.e. real student/testing activity
 * against the demo environment, which "Reload" is meant to clear.
 */
const CANONICAL_YEAR = 2026;
const CANONICAL_MAX_SEQUENCE = 3010;
const REFERENCE_CODE_PATTERN = /^FB-(\d{4})-(\d{6})$/;

function isProtectedReferenceCode(referenceCode) {
  const match = REFERENCE_CODE_PATTERN.exec(referenceCode || '');
  if (!match) return false;
  return Number(match[1]) === CANONICAL_YEAR && Number(match[2]) <= CANONICAL_MAX_SEQUENCE;
}

/**
 * Restores FeedbackSession/FeedbackAnswer to the P9.1 Canonical
 * Demonstration Dataset baseline: deletes every session outside the
 * protected reference-code range (and its answers), then re-upserts the
 * canonical dataset via loadCanonicalDataset.js's existing logic —
 * reused unchanged, never reimplemented, and never regenerated (this
 * function only reads backend/demo-data/feedback-sessions.json, it never calls
 * generateCanonicalDataset.js). Never touches Users, Departments,
 * Locations, Tablets, Surveys, Questions, Personnel, or Settings.
 */
export async function reloadCanonicalDataset() {
  const filePath = path.join(DEMO_DATA_DIR, 'feedback-sessions.json');
  if (!fs.existsSync(filePath)) {
    throw new ApiError(
      500,
      'Canonical dataset file not found. Run "npm run canonical:generate" on the server first.',
    );
  }

  const existingSessions = await FeedbackSession.find({}).select('_id referenceCode');
  const extraneousIds = existingSessions
    .filter((session) => !isProtectedReferenceCode(session.referenceCode))
    .map((session) => session._id);

  let deletedAnswers = 0;
  let deletedSessions = 0;

  if (extraneousIds.length > 0) {
    const answerResult = await FeedbackAnswer.deleteMany({
      feedbackSessionId: { $in: extraneousIds },
    });
    deletedAnswers = answerResult.deletedCount ?? 0;

    const sessionResult = await FeedbackSession.deleteMany({ _id: { $in: extraneousIds } });
    deletedSessions = sessionResult.deletedCount ?? 0;
  }

  const loadResult = await loadCanonicalDataset();

  return {
    deletedSessions,
    deletedAnswers,
    restoredSessions: loadResult.sessionCount,
    restoredAnswers: loadResult.answerCount,
  };
}
