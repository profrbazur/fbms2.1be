import Department from '../models/Department.js';
import User from '../models/User.js';

/**
 * Dev-only default password for every seeded account. Override with
 * SEED_DEFAULT_PASSWORD when running the seeder if a different value is
 * needed. Never used for anything beyond local/dev testing — see
 * docs/PROJECT_SCOPE.md's seeded-users requirement and ADR-005.
 */
export const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Passw0rd!123';

const DEPARTMENTS = [
  { name: 'Registrar', code: 'REG', description: 'Registrar Office' },
  { name: 'Library', code: 'LIB', description: 'Library Services' },
];

function buildUserDefinitions(departmentIdByCode) {
  return [
    {
      email: 'superadmin@fbms.test',
      displayName: 'System Administrator',
      role: 'super_admin',
      departmentId: null,
    },
    {
      email: 'registrar.head@fbms.test',
      displayName: 'Registrar Department Head',
      role: 'department_head',
      departmentId: departmentIdByCode.REG,
    },
    {
      email: 'library.head@fbms.test',
      displayName: 'Library Department Head',
      role: 'department_head',
      departmentId: departmentIdByCode.LIB,
    },
    ...[1, 2, 3].map((n) => ({
      email: `registrar.staff${n}@fbms.test`,
      displayName: `Registrar Personnel ${n}`,
      role: 'personnel',
      departmentId: departmentIdByCode.REG,
    })),
    ...[1, 2, 3].map((n) => ({
      email: `library.staff${n}@fbms.test`,
      displayName: `Library Personnel ${n}`,
      role: 'personnel',
      departmentId: departmentIdByCode.LIB,
    })),
  ];
}

/**
 * Idempotent: safe to run any number of times. Departments are
 * upserted by code; users are upserted by email with their password
 * reset to DEFAULT_PASSWORD and isActive forced to true each run, so
 * the seeded set is always in a known, predictable state for QA.
 */
export async function seedUsers() {
  const departmentIdByCode = {};

  for (const department of DEPARTMENTS) {
    const doc = await Department.findOneAndUpdate(
      { code: department.code },
      { $set: department },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    departmentIdByCode[department.code] = doc._id;
  }

  const passwordHash = await User.hashPassword(DEFAULT_PASSWORD);
  const userDefinitions = buildUserDefinitions(departmentIdByCode);

  for (const definition of userDefinitions) {
    await User.findOneAndUpdate(
      { email: definition.email },
      {
        $set: {
          displayName: definition.displayName,
          role: definition.role,
          departmentId: definition.departmentId,
          authProvider: 'local',
          isActive: true,
          passwordHash,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  }

  return {
    departmentCount: DEPARTMENTS.length,
    userCount: userDefinitions.length,
    seededEmails: userDefinitions.map((u) => u.email),
  };
}
