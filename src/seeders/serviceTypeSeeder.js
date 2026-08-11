import Department from '../models/Department.js';
import ServiceType from '../models/ServiceType.js';

/**
 * Clearly non-production sample Service Types (V2.6 —
 * backend/docs/v2/V2_6_SERVICE_TYPES.md's own approved example lists,
 * used verbatim). "Clearance" and "Other Inquiry" deliberately exist in
 * BOTH departments with the same name/code suffix pattern — proves the
 * department-scoped (not global) uniqueness model actually works, per
 * that document's own "the same label... must be valid in both" note.
 * "Computer / Internet Assistance" is seeded `isActive: false` to
 * exercise the active/inactive lifecycle in both the admin list (Status
 * filter) and mobile attribution (an inactive type must be rejected by
 * assertServiceTypeIsUsable).
 */
const SERVICE_TYPES = [
  { name: 'Enrollment / Registration', code: 'REG-SVC-01', departmentCode: 'REG', sortOrder: 1 },
  { name: 'Student Records', code: 'REG-SVC-02', departmentCode: 'REG', sortOrder: 2 },
  { name: 'Certificates / Documents', code: 'REG-SVC-03', departmentCode: 'REG', sortOrder: 3 },
  { name: 'Subject / Schedule Concerns', code: 'REG-SVC-04', departmentCode: 'REG', sortOrder: 4 },
  { name: 'Clearance', code: 'REG-SVC-05', departmentCode: 'REG', sortOrder: 5 },
  { name: 'Other Inquiry', code: 'REG-SVC-06', departmentCode: 'REG', sortOrder: 6 },
  { name: 'Borrowing / Returning', code: 'LIB-SVC-01', departmentCode: 'LIB', sortOrder: 1 },
  { name: 'Library Account', code: 'LIB-SVC-02', departmentCode: 'LIB', sortOrder: 2 },
  { name: 'Research Assistance', code: 'LIB-SVC-03', departmentCode: 'LIB', sortOrder: 3 },
  {
    name: 'Computer / Internet Assistance',
    code: 'LIB-SVC-04',
    departmentCode: 'LIB',
    sortOrder: 4,
    isActive: false,
  },
  { name: 'Clearance', code: 'LIB-SVC-05', departmentCode: 'LIB', sortOrder: 5 },
  { name: 'Other Inquiry', code: 'LIB-SVC-06', departmentCode: 'LIB', sortOrder: 6 },
];

/**
 * Idempotent: upserts each sample service type by its unique
 * { departmentId, code } pair, keyed to whichever Registrar/Library
 * department id currently exists — mirrors organizationSeeder.js's
 * seedLocations exactly, including the same "skip if the department
 * doesn't exist yet" safety.
 */
export async function seedServiceTypes() {
  const departmentCodes = [...new Set(SERVICE_TYPES.map((serviceType) => serviceType.departmentCode))];
  const departments = await Department.find({ code: { $in: departmentCodes } });
  const departmentIdByCode = Object.fromEntries(
    departments.map((department) => [department.code, department._id]),
  );

  let seededCount = 0;

  for (const serviceType of SERVICE_TYPES) {
    const departmentId = departmentIdByCode[serviceType.departmentCode];

    if (!departmentId) {
      continue;
    }

    await ServiceType.findOneAndUpdate(
      { departmentId, code: serviceType.code },
      {
        $set: {
          name: serviceType.name,
          description: '',
          sortOrder: serviceType.sortOrder,
          isActive: serviceType.isActive ?? true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    seededCount += 1;
  }

  return { serviceTypeCount: seededCount };
}
