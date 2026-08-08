import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * P9.1 — Canonical Demonstration Dataset generator.
 *
 * Pure computation, no database connection: reads nothing but this
 * file's own constants and writes two portable JSON files to
 * `backend/demo-data/` (packaged alongside the backend so it deploys
 * together with the Render backend service — P9.3). `loadCanonicalDataset.js` is the
 * separate script that actually inserts the generated data into the
 * development database (see that file for why the two steps are split).
 *
 * Deterministic by construction — a fixed PRNG seed plus a fixed
 * iteration order means re-running this script produces byte-identical
 * output every time (see mulberry32() below and GENERATION_PARAMETERS
 * in backend/demo-data/GENERATION_PARAMETERS.md, which documents every
 * assumption baked into this file so the numbers are auditable rather
 * than a black box).
 *
 * Only references entities that already exist in the approved data
 * model and the current seeded state (organizationSeeder.js/
 * surveySeeder.js/tabletSeeder.js) — no new Survey, Tablet, Location,
 * or Department is invented here. In particular: "Library Services
 * Feedback" is seeded as a draft (unpublished) survey, so
 * mobileService.resolveActiveSurveyForTablet's real Location→
 * Department→Global precedence means a Library tablet can only ever
 * resolve the Global "General Service Feedback" survey while that
 * remains true — this generator follows that exact precedence rather
 * than inventing Library-specific feedback questions that no real
 * tablet could ever have submitted.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DATA_DIR = path.resolve(__dirname, '../../demo-data');

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — see GENERATION_PARAMETERS.md.
// ---------------------------------------------------------------------------

const SEED = 20260801;

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function pickWeighted(rngFn, items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rngFn() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function pickIndex(rngFn, length) {
  return Math.min(length - 1, Math.floor(rngFn() * length));
}

// ---------------------------------------------------------------------------
// Date range: 2026-03-01 through 2026-08-08 inclusive (161 days).
// ---------------------------------------------------------------------------

const RANGE_START = new Date(Date.UTC(2026, 2, 1)); // March 1, 2026
const RANGE_END = new Date(Date.UTC(2026, 7, 8)); // August 8, 2026
const TOTAL_SESSIONS = 3000;
const REFERENCE_CODE_START = 11; // continues feedbackSeeder.js's FB-2026-000001..000010
const REFERENCE_CODE_PREFIX = 'FB-2026-';

function enumerateDays(start, end) {
  const days = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// Illustrative academic-calendar shape — a documented assumption, not
// sourced from any real institutional calendar (no prior distribution
// spec was supplied to this phase). See GENERATION_PARAMETERS.md.
const MONTH_WEIGHTS = { 3: 1.35, 4: 1.05, 5: 0.55, 6: 1.15, 7: 1.25, 8: 1.1 };
const WEEKDAY_WEIGHTS = { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.3 }; // 0=Sun..6=Sat, offices closed Sunday

function computeDayWeight(date, rngFn) {
  const month = date.getUTCMonth() + 1;
  const weekday = date.getUTCDay();
  const noise = randomFloatWith(rngFn, 0.85, 1.15);
  return MONTH_WEIGHTS[month] * WEEKDAY_WEIGHTS[weekday] * noise;
}

function randomFloatWith(rngFn, min, max) {
  return min + rngFn() * (max - min);
}

/** Largest-remainder allocation so per-day integer counts sum to exactly TOTAL_SESSIONS. */
function allocateCounts(weights, total) {
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  const raw = weights.map((w) => (w / sumWeights) * total);
  const floors = raw.map(Math.floor);
  let allocated = floors.reduce((sum, v) => sum + v, 0);
  let remaining = total - allocated;

  const remainders = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  const counts = [...floors];
  for (let i = 0; i < remaining; i += 1) {
    counts[remainders[i % remainders.length].index] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Departments / tablets / surveys — mirrors organizationSeeder.js/
// tabletSeeder.js/surveySeeder.js exactly (business keys, not ObjectIds).
// ---------------------------------------------------------------------------

const REGISTRAR_TABLETS = [
  { deviceCode: 'REG-TAB-01', weight: 0.55 },
  { deviceCode: 'REG-TAB-02', weight: 0.45 },
];
const LIBRARY_TABLETS = [
  { deviceCode: 'LIB-TAB-01', weight: 0.55 },
  { deviceCode: 'LIB-TAB-02', weight: 0.45 },
];

const REGISTRAR_SURVEY_TITLE = 'Registrar Office Feedback';
const GLOBAL_SURVEY_TITLE = 'General Service Feedback';

// Department split baseline (Registrar slightly busier); Registrar gets an
// extra enrollment-season boost in March/June, since that traffic realistically
// concentrates on registration rather than library services.
const DEPARTMENT_BASE_SHARE = { registrar: 0.55, library: 0.45 };
const REGISTRAR_ENROLLMENT_MONTHS = new Set([3, 6]);
const REGISTRAR_ENROLLMENT_BOOST = 0.15;

function registrarShareForMonth(month) {
  const boost = REGISTRAR_ENROLLMENT_MONTHS.has(month) ? REGISTRAR_ENROLLMENT_BOOST : 0;
  return Math.min(0.85, DEPARTMENT_BASE_SHARE.registrar + boost);
}

// ---------------------------------------------------------------------------
// Business-hours submission time.
// ---------------------------------------------------------------------------

const HOUR_WEIGHTS = [8, 9, 10, 10, 11, 11, 12, 13, 13, 14, 14, 15, 16, 17];

function randomSubmittedAt(date, rngFn) {
  const hour = HOUR_WEIGHTS[pickIndex(rngFn, HOUR_WEIGHTS.length)];
  const minute = randomInt2(rngFn, 0, 59);
  const second = randomInt2(rngFn, 0, 59);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute,
    second,
  ));
}

function randomInt2(rngFn, min, max) {
  return Math.floor(min + rngFn() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Answer generation — rating distributions, correlated yes/no, weighted
// multiple choice, and comment-pool text answers.
// ---------------------------------------------------------------------------

// Base rating distribution (5..1), documented in GENERATION_PARAMETERS.md.
const BASE_RATING_WEIGHTS = [
  { value: 5, weight: 0.32 },
  { value: 4, weight: 0.33 },
  { value: 3, weight: 0.17 },
  { value: 2, weight: 0.12 },
  { value: 1, weight: 0.06 },
];

// During Registrar's own enrollment-boosted months, crowding realistically
// nudges satisfaction down a little (documented, intentional — not a
// fabricated incident, just volume-driven wait times).
const CROWDED_RATING_WEIGHTS = [
  { value: 5, weight: 0.22 },
  { value: 4, weight: 0.28 },
  { value: 3, weight: 0.22 },
  { value: 2, weight: 0.18 },
  { value: 1, weight: 0.1 },
];

function pickRating(rngFn, { crowded }) {
  return pickWeighted(rngFn, crowded ? CROWDED_RATING_WEIGHTS : BASE_RATING_WEIGHTS);
}

function correlatedYesNo(rngFn, rating) {
  let trueProb;
  if (rating >= 4) trueProb = 0.93;
  else if (rating === 3) trueProb = 0.6;
  else trueProb = 0.15;
  return rngFn() < trueProb;
}

const REGISTRAR_SERVICE_OPTIONS_BASE = [
  { value: 'Enrollment', weight: 0.3 },
  { value: 'Document Request', weight: 0.32 },
  { value: 'Grade Inquiry', weight: 0.23 },
  { value: 'Other', weight: 0.15 },
];
const REGISTRAR_SERVICE_OPTIONS_ENROLLMENT_SEASON = [
  { value: 'Enrollment', weight: 0.55 },
  { value: 'Document Request', weight: 0.22 },
  { value: 'Grade Inquiry', weight: 0.14 },
  { value: 'Other', weight: 0.09 },
];

function pickRegistrarService(rngFn, { enrollmentSeason }) {
  return pickWeighted(
    rngFn,
    enrollmentSeason ? REGISTRAR_SERVICE_OPTIONS_ENROLLMENT_SEASON : REGISTRAR_SERVICE_OPTIONS_BASE,
  );
}

const COMMENT_POOLS = {
  generalLongText: {
    positive: [
      'Staff were very helpful and quick to assist.',
      'Overall a great experience, no complaints.',
      'Very professional and efficient service.',
      'The staff handled my request smoothly.',
      'Quick and pleasant transaction today.',
      'Friendly staff, fast processing.',
      'Excellent service, keep it up.',
      'No issues at all, very satisfied.',
    ],
    neutral: [
      'Service was okay, nothing special.',
      'Average experience, room for improvement.',
      'It was fine, though the wait was a bit long.',
      'Decent service overall.',
    ],
    negative: [
      'Had to wait a long time before being assisted.',
      'Staff seemed overwhelmed today.',
      'Service was slower than expected.',
      'Not satisfied with how my concern was handled.',
      'Needs improvement, the process felt disorganized.',
    ],
  },
  registrarShortText: {
    positive: [
      'Keep up the great work!',
      'Fast processing.',
      'No complaints, excellent service.',
      'Great job, very efficient.',
    ],
    neutral: [
      'Could be a bit faster.',
      'More staff during peak hours would help.',
      'Signage could be clearer.',
    ],
    negative: [
      'Still waiting for a response on my inquiry.',
      'Long queues need to be addressed.',
      'Please improve processing time.',
      'The system seemed slow today.',
    ],
  },
};

function ratingBucket(rating) {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

function pickComment(rngFn, pool, rating, blankChance) {
  if (rngFn() < blankChance) return '';
  const bucket = pool[ratingBucket(rating)];
  return bucket[pickIndex(rngFn, bucket.length)];
}

// ---------------------------------------------------------------------------
// Session assembly.
// ---------------------------------------------------------------------------

function buildGlobalAnswers(rngFn, rating) {
  return [
    { questionText: 'How would you rate your overall experience today?', answer: rating },
    {
      questionText: 'Would you recommend our services to others?',
      answer: correlatedYesNo(rngFn, rating),
    },
    {
      questionText: 'Do you have any additional comments?',
      answer: pickComment(rngFn, COMMENT_POOLS.generalLongText, rating, 0.2),
    },
  ];
}

function buildRegistrarAnswers(rngFn, rating, enrollmentSeason) {
  const answers = [
    { questionText: 'How satisfied are you with the registration process?', answer: rating },
    {
      questionText: 'Which service did you avail today?',
      answer: pickRegistrarService(rngFn, { enrollmentSeason }),
    },
  ];

  // "Was your concern resolved?" is optional — include ~90% of the time.
  if (rngFn() < 0.9) {
    answers.push({
      questionText: 'Was your concern resolved?',
      answer: correlatedYesNo(rngFn, rating),
    });
  }

  answers.push({
    questionText: 'Any suggestions for improvement?',
    answer: pickComment(rngFn, COMMENT_POOLS.registrarShortText, rating, 0.25),
  });

  return answers;
}

function buildSession(date, rngFn) {
  const month = date.getUTCMonth() + 1;
  const enrollmentSeason = REGISTRAR_ENROLLMENT_MONTHS.has(month);
  const registrarShare = registrarShareForMonth(month);

  const isRegistrar = rngFn() < registrarShare;
  const tabletCode = isRegistrar
    ? pickWeighted(rngFn, REGISTRAR_TABLETS.map((t) => ({ value: t.deviceCode, weight: t.weight })))
    : pickWeighted(rngFn, LIBRARY_TABLETS.map((t) => ({ value: t.deviceCode, weight: t.weight })));

  const surveyTitle = isRegistrar ? REGISTRAR_SURVEY_TITLE : GLOBAL_SURVEY_TITLE;
  const rating = pickRating(rngFn, { crowded: isRegistrar && enrollmentSeason });

  const answers = isRegistrar
    ? buildRegistrarAnswers(rngFn, rating, enrollmentSeason)
    : buildGlobalAnswers(rngFn, rating);

  const submittedAt = randomSubmittedAt(date, rngFn);
  const baseSeconds = 40 + answers.length * 20;
  const durationSeconds = baseSeconds + randomInt2(rngFn, -10, 25);
  const completedAt = new Date(submittedAt.getTime() + durationSeconds * 1000);

  return {
    department: isRegistrar ? 'registrar' : 'library',
    surveyTitle,
    tabletDeviceCode: tabletCode,
    submittedAt,
    completedAt,
    answers,
    rating,
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main() {
  const days = enumerateDays(RANGE_START, RANGE_END);
  const dayWeights = days.map((date) => computeDayWeight(date, rng));
  const dayCounts = allocateCounts(dayWeights, TOTAL_SESSIONS);

  const rawSessions = [];
  days.forEach((date, index) => {
    const count = dayCounts[index];
    for (let i = 0; i < count; i += 1) {
      rawSessions.push(buildSession(date, rng));
    }
  });

  // Assign reference codes in chronological order, continuing
  // feedbackSeeder.js's FB-2026-000001..000010 sequence from 000011.
  rawSessions.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const sessions = rawSessions.map((session, index) => ({
    referenceCode: `${REFERENCE_CODE_PREFIX}${String(REFERENCE_CODE_START + index).padStart(6, '0')}`,
    surveyTitle: session.surveyTitle,
    tabletDeviceCode: session.tabletDeviceCode,
    submittedAt: session.submittedAt.toISOString(),
    completedAt: session.completedAt.toISOString(),
    answers: session.answers,
  }));

  // Aggregate stats used to populate backend/demo-data/EXPECTED_DASHBOARD.md with
  // real, computed numbers rather than estimates.
  const stats = {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    totalSessions: sessions.length,
    dateRange: { start: RANGE_START.toISOString(), end: RANGE_END.toISOString() },
    referenceCodeRange: {
      first: sessions[0].referenceCode,
      last: sessions[sessions.length - 1].referenceCode,
    },
    byDepartment: countBy(rawSessions, (s) => s.department),
    bySurvey: countBy(rawSessions, (s) => s.surveyTitle),
    byTablet: countBy(rawSessions, (s) => s.tabletDeviceCode),
    byMonth: countBy(rawSessions, (s) => `${s.submittedAt.getUTCFullYear()}-${String(s.submittedAt.getUTCMonth() + 1).padStart(2, '0')}`),
    ratingDistribution: countBy(rawSessions, (s) => String(s.rating)),
    averageRatingOverall: average(rawSessions.map((s) => s.rating)),
    averageRatingByDepartment: {
      registrar: average(rawSessions.filter((s) => s.department === 'registrar').map((s) => s.rating)),
      library: average(rawSessions.filter((s) => s.department === 'library').map((s) => s.rating)),
    },
    totalAnswers: sessions.reduce((sum, s) => sum + s.answers.length, 0),
  };

  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DEMO_DATA_DIR, 'feedback-sessions.json'),
    `${JSON.stringify(sessions, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(DEMO_DATA_DIR, 'generation-stats.json'),
    `${JSON.stringify(stats, null, 2)}\n`,
  );

  console.log(`Generated ${sessions.length} canonical feedback sessions.`);
  console.log(`Reference codes: ${stats.referenceCodeRange.first} .. ${stats.referenceCodeRange.last}`);
  console.log(`Written to: ${DEMO_DATA_DIR}`);
  console.log(JSON.stringify(stats, null, 2));
}

function countBy(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

// Only run when executed directly (`node src/seeders/generateCanonicalDataset.js`
// / `npm run canonical:generate`) — guards against a future import of this
// module (e.g. for its constants) unexpectedly regenerating files on disk
// as a side effect, the same reasoning loadCanonicalDataset.js's own guard
// documents.
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMainModule) {
  main();
}
