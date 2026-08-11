import path from 'node:path';
import fs from 'node:fs';
import OrganizationSettings from '../models/OrganizationSettings.js';

/**
 * Used only as the seed values for the very first insert — see
 * seeders/organizationSeeder.js for the authoritative dev-seed values.
 * Kept here too so getOrganizationSettings() never returns a
 * validation error if it runs before the seeder does (e.g. a fresh test
 * database with no seeder run yet).
 */
const FALLBACK_DEFAULTS = {
  universityName: 'Feedback Management System Demo University',
  address: 'Development Address',
  contactNumber: 'Development Contact Number',
  email: 'admin@fbms.test',
  contactPerson: 'FBMS Administrator',
  primaryColor: '#002E1F',
  secondaryColor: '#5F5E5E',
  logoUrl: '',
  mobileHeartbeatIntervalSeconds: 300,
  mobileMinAppVersion: '1.0.0',
  feedbackSessionTimeoutSeconds: 120,
  defaultTrendWindowDays: 7,
  defaultPaginationSize: 20,
  timezone: 'Asia/Manila',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '12h',
  defaultSatisfactionTarget: 4,
};

const LOGO_UPLOAD_URL_PREFIX = '/uploads/logos/';

/**
 * Safe singleton retrieval: atomically creates the one-and-only record
 * on first read (upsert with an empty filter) instead of requiring a
 * separate "has it been seeded yet" check. Every subsequent call
 * updates/reads that same document.
 */
export async function getOrganizationSettings() {
  const settings = await OrganizationSettings.findOneAndUpdate(
    {},
    { $setOnInsert: FALLBACK_DEFAULTS },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return settings;
}

export async function updateOrganizationSettings(updates) {
  await getOrganizationSettings();

  const settings = await OrganizationSettings.findOneAndUpdate(
    {},
    { $set: updates },
    { returnDocument: 'after', runValidators: true, context: 'query' },
  );

  return settings;
}

/**
 * The only writer of logoUrl/logoOriginalName/logoUploadedAt (P8.0,
 * ADR-044) — never reachable through PATCH /api/v1/settings or
 * /api/v1/organization's body, only through the dedicated
 * `POST /api/v1/settings/logo` upload endpoint's already-validated,
 * already-stored `file` (see middleware/uploadLogo.js). Best-effort
 * deletes the previous logo file from local disk when it was itself a
 * local upload (never touches an externally-typed http(s) URL some
 * admin may have set via the older /organization endpoint) — a stale
 * orphaned file is a minor disk-space leak, not a correctness issue, so
 * a failed unlink is deliberately swallowed rather than failing the
 * request that already succeeded in the database.
 */
export async function setOrganizationLogo(file) {
  const previous = await getOrganizationSettings();
  const relativeUrl = `${LOGO_UPLOAD_URL_PREFIX}${file.filename}`;

  const settings = await OrganizationSettings.findOneAndUpdate(
    {},
    {
      $set: {
        logoUrl: relativeUrl,
        logoOriginalName: file.originalname,
        logoUploadedAt: new Date(),
      },
    },
    { returnDocument: 'after', runValidators: true, context: 'query' },
  );

  if (previous.logoUrl && previous.logoUrl.startsWith(LOGO_UPLOAD_URL_PREFIX) && previous.logoUrl !== relativeUrl) {
    const previousPath = path.join(process.cwd(), previous.logoUrl);
    fs.unlink(previousPath, () => {});
  }

  return settings;
}
