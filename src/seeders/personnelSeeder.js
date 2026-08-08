import Department from '../models/Department.js';
import User from '../models/User.js';
import Personnel from '../models/Personnel.js';

/**
 * Clearly non-production sample Personnel records, linked to the
 * existing seeded authentication users by email — never creates,
 * modifies, or unlinks a User. One record per Registrar/Library
 * Department Head and per Personnel-role staff account (8 total); the
 * Super Admin intentionally has no Personnel record (it is a
 * system-wide account, not tied to a department) per this phase's
 * seeding instructions.
 */
const PERSONNEL_RECORDS = [
  {
    employeeNumber: 'REG-0001',
    firstName: 'Miguel',
    lastName: 'Santos',
    position: 'Registrar Department Head',
    departmentCode: 'REG',
    linkedEmail: 'registrar.head@fbms.test',
    email: 'miguel.santos@fbms.test',
    contactNumber: '+63 917 000 0001',
  },
  {
    employeeNumber: 'REG-0002',
    firstName: 'Andrea',
    lastName: 'Reyes',
    position: 'Registrar Staff',
    departmentCode: 'REG',
    linkedEmail: 'registrar.staff1@fbms.test',
    email: 'andrea.reyes@fbms.test',
    contactNumber: '+63 917 000 0002',
  },
  {
    employeeNumber: 'REG-0003',
    firstName: 'Carlo',
    lastName: 'Dela Cruz',
    position: 'Registrar Staff',
    departmentCode: 'REG',
    linkedEmail: 'registrar.staff2@fbms.test',
    email: 'carlo.delacruz@fbms.test',
    contactNumber: '+63 917 000 0003',
  },
  {
    employeeNumber: 'REG-0004',
    firstName: 'Bianca',
    lastName: 'Torres',
    position: 'Registrar Staff',
    departmentCode: 'REG',
    linkedEmail: 'registrar.staff3@fbms.test',
    email: 'bianca.torres@fbms.test',
    contactNumber: '+63 917 000 0004',
  },
  {
    employeeNumber: 'LIB-0001',
    firstName: 'Patricia',
    lastName: 'Ramos',
    position: 'Library Department Head',
    departmentCode: 'LIB',
    linkedEmail: 'library.head@fbms.test',
    email: 'patricia.ramos@fbms.test',
    contactNumber: '+63 917 000 0005',
  },
  {
    employeeNumber: 'LIB-0002',
    firstName: 'Joshua',
    lastName: 'Fernandez',
    position: 'Library Staff',
    departmentCode: 'LIB',
    linkedEmail: 'library.staff1@fbms.test',
    email: 'joshua.fernandez@fbms.test',
    contactNumber: '+63 917 000 0006',
  },
  {
    employeeNumber: 'LIB-0003',
    firstName: 'Camille',
    lastName: 'Aquino',
    position: 'Library Staff',
    departmentCode: 'LIB',
    linkedEmail: 'library.staff2@fbms.test',
    email: 'camille.aquino@fbms.test',
    contactNumber: '+63 917 000 0007',
  },
  {
    employeeNumber: 'LIB-0004',
    firstName: 'Nathaniel',
    lastName: 'Cruz',
    position: 'Library Staff',
    departmentCode: 'LIB',
    linkedEmail: 'library.staff3@fbms.test',
    email: 'nathaniel.cruz@fbms.test',
    contactNumber: '+63 917 000 0008',
  },
];

/**
 * Idempotent: upserts each record by its unique employeeNumber, keyed
 * to whichever department/user currently exist. Never writes to the
 * User collection — the User must already exist (created by
 * userSeeder.js) for its record to be linked.
 */
export async function seedPersonnel() {
  const departmentCodes = [...new Set(PERSONNEL_RECORDS.map((record) => record.departmentCode))];
  const departments = await Department.find({ code: { $in: departmentCodes } });
  const departmentIdByCode = Object.fromEntries(
    departments.map((department) => [department.code, department._id]),
  );

  const linkedEmails = PERSONNEL_RECORDS.map((record) => record.linkedEmail);
  const users = await User.find({ email: { $in: linkedEmails } });
  const userByEmail = Object.fromEntries(users.map((user) => [user.email, user]));

  let seededCount = 0;

  for (const record of PERSONNEL_RECORDS) {
    const departmentId = departmentIdByCode[record.departmentCode];

    if (!departmentId) {
      continue;
    }

    const linkedUser = userByEmail[record.linkedEmail];

    // Unset (not null) when unlinked — see the model's userId comment on
    // why an explicit `null` would break the sparse unique index once more
    // than one record is unlinked (mirrors personnelService.js).
    const update = {
      $set: {
        firstName: record.firstName,
        lastName: record.lastName,
        email: record.email,
        contactNumber: record.contactNumber,
        position: record.position,
        departmentId,
        isActive: true,
      },
    };
    if (linkedUser) {
      update.$set.userId = linkedUser._id;
    } else {
      update.$unset = { userId: '' };
    }

    await Personnel.findOneAndUpdate(
      { employeeNumber: record.employeeNumber },
      update,
      { upsert: true, setDefaultsOnInsert: true },
    );
    seededCount += 1;
  }

  return { personnelCount: seededCount };
}
