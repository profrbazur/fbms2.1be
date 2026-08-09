import OrganizationSettings from '../models/OrganizationSettings.js';
import Department from '../models/Department.js';
import Building from '../models/Building.js';
import Location from '../models/Location.js';

/**
 * Development-only defaults per this phase's Seeding instructions.
 * Primary/secondary colors match the existing approved theme tokens
 * (frontend/src/index.css --color-primary/--color-secondary).
 */
const DEFAULT_SETTINGS = {
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
  // P8.0 (System Settings) additions — same $setOnInsert-only treatment
  // as every other field here, so re-running the seeder never resets an
  // admin's already-configured values.
  feedbackSessionTimeoutSeconds: 120,
  defaultTrendWindowDays: 7,
  defaultPaginationSize: 20,
  timezone: 'Asia/Manila',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '12h',
};

/**
 * V2.3 — physical campus buildings (docs/v2/V2_3_BUILDING_LOCATION.md's
 * "Initial known Benilde buildings" list). Global master data, not tied
 * to any single department. "Sports and Dormitory Complex" is
 * deliberately seeded but not currently referenced by any sample
 * Location below — exercises the "building with zero locations" case.
 */
const BUILDINGS = [
  {
    name: 'Taft Campus',
    code: 'TAFT',
    description: 'Main Taft Avenue campus (sample data).',
  },
  {
    name: 'Design + Arts Campus',
    code: 'DAC',
    description: 'Design and Arts campus (sample data).',
  },
  {
    name: 'The Atrium@Benilde',
    code: 'ATRIUM',
    description: 'The Atrium@Benilde building (sample data).',
  },
  {
    name: 'Angelo King International Center',
    code: 'AKIC',
    description: 'Angelo King International Center (sample data).',
  },
  {
    name: 'Sports and Dormitory Complex',
    code: 'SDC',
    description: 'Sports and Dormitory Complex (sample data).',
  },
];

/**
 * Clearly non-production sample locations distributed between the two
 * existing seeded departments (Registrar, Library) and, as of V2.3,
 * across multiple buildings — Registrar's two locations deliberately
 * span two different buildings (Taft Campus / Design + Arts Campus) to
 * demonstrate that the same department can have service windows in more
 * than one building, per docs/v2/V2_3_BUILDING_LOCATION.md's own example.
 */
const LOCATIONS = [
  {
    name: 'Registrar Main Counter',
    code: 'REG-LOC-01',
    description: 'Ground floor student service counter (sample data).',
    departmentCode: 'REG',
    buildingCode: 'TAFT',
  },
  {
    name: 'Registrar Records Room',
    code: 'REG-LOC-02',
    description: 'Student records processing area (sample data).',
    departmentCode: 'REG',
    buildingCode: 'DAC',
  },
  {
    name: 'Library Circulation Desk',
    code: 'LIB-LOC-01',
    description: 'Book borrowing/returning counter (sample data).',
    departmentCode: 'LIB',
    buildingCode: 'ATRIUM',
  },
  {
    name: 'Library Reading Hall',
    code: 'LIB-LOC-02',
    description: 'Main reading and study area (sample data).',
    departmentCode: 'LIB',
    buildingCode: 'AKIC',
  },
];

/**
 * Idempotent: upserts the single OrganizationSettings record only if
 * none exists yet (never overwrites an admin's real edits on re-run).
 */
export async function seedOrganizationSettings() {
  const settings = await OrganizationSettings.findOneAndUpdate(
    {},
    { $setOnInsert: DEFAULT_SETTINGS },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return settings;
}

/**
 * Idempotent: upserts each sample building by its unique code. Safe to
 * run any number of times, and independent of Department/User seeding
 * since a Building has no owning department.
 */
export async function seedBuildings() {
  let seededCount = 0;

  for (const building of BUILDINGS) {
    await Building.findOneAndUpdate(
      { code: building.code },
      {
        $set: {
          name: building.name,
          description: building.description,
          isActive: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    seededCount += 1;
  }

  return { buildingCount: seededCount };
}

/**
 * Idempotent: upserts each sample location by its unique code, keyed to
 * whichever Registrar/Library department id and Building id currently
 * exist. Safe to run any number of times and safe to run before or
 * after seedUsers()/seedBuildings() as long as the two departments and
 * referenced buildings already exist (per the same "skip if a
 * dependency is missing" convention feedbackSeeder.js/tabletSeeder.js
 * already use).
 */
export async function seedLocations() {
  const departmentCodes = [...new Set(LOCATIONS.map((location) => location.departmentCode))];
  const departments = await Department.find({ code: { $in: departmentCodes } });
  const departmentIdByCode = Object.fromEntries(
    departments.map((department) => [department.code, department._id]),
  );

  const buildingCodes = [...new Set(LOCATIONS.map((location) => location.buildingCode))];
  const buildings = await Building.find({ code: { $in: buildingCodes } });
  const buildingIdByCode = Object.fromEntries(
    buildings.map((building) => [building.code, building._id]),
  );

  let seededCount = 0;

  for (const location of LOCATIONS) {
    const departmentId = departmentIdByCode[location.departmentCode];
    const buildingId = buildingIdByCode[location.buildingCode];

    if (!departmentId || !buildingId) {
      continue;
    }

    await Location.findOneAndUpdate(
      { code: location.code },
      {
        $set: {
          name: location.name,
          description: location.description,
          departmentId,
          buildingId,
          isActive: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    seededCount += 1;
  }

  return { locationCount: seededCount };
}
