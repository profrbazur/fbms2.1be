import OrganizationSettings from '../models/OrganizationSettings.js';
import Department from '../models/Department.js';
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
 * Clearly non-production sample locations distributed between the two
 * existing seeded departments (Registrar, Library).
 */
const LOCATIONS = [
  {
    name: 'Registrar Main Counter',
    code: 'REG-LOC-01',
    description: 'Ground floor student service counter (sample data).',
    departmentCode: 'REG',
  },
  {
    name: 'Registrar Records Room',
    code: 'REG-LOC-02',
    description: 'Student records processing area (sample data).',
    departmentCode: 'REG',
  },
  {
    name: 'Library Circulation Desk',
    code: 'LIB-LOC-01',
    description: 'Book borrowing/returning counter (sample data).',
    departmentCode: 'LIB',
  },
  {
    name: 'Library Reading Hall',
    code: 'LIB-LOC-02',
    description: 'Main reading and study area (sample data).',
    departmentCode: 'LIB',
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
 * Idempotent: upserts each sample location by its unique code, keyed to
 * whichever Registrar/Library department id currently exists. Safe to
 * run any number of times and safe to run before or after seedUsers()
 * as long as the two departments already exist.
 */
export async function seedLocations() {
  const departmentCodes = [...new Set(LOCATIONS.map((location) => location.departmentCode))];
  const departments = await Department.find({ code: { $in: departmentCodes } });
  const departmentIdByCode = Object.fromEntries(
    departments.map((department) => [department.code, department._id]),
  );

  let seededCount = 0;

  for (const location of LOCATIONS) {
    const departmentId = departmentIdByCode[location.departmentCode];

    if (!departmentId) {
      continue;
    }

    await Location.findOneAndUpdate(
      { code: location.code },
      {
        $set: {
          name: location.name,
          description: location.description,
          departmentId,
          isActive: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    seededCount += 1;
  }

  return { locationCount: seededCount };
}
