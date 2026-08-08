import Department from '../models/Department.js';
import Location from '../models/Location.js';
import Tablet from '../models/Tablet.js';
import { generateActivationToken } from '../utils/generateActivationToken.js';

/**
 * Clearly non-production sample tablets distributed across the sample
 * locations seeded in organizationSeeder.js (Registrar/Library).
 */
const TABLETS = [
  {
    deviceCode: 'REG-TAB-01',
    deviceName: 'Registrar Main Counter Kiosk',
    serialNumber: 'SN-REG-0001',
    locationCode: 'REG-LOC-01',
    departmentCode: 'REG',
  },
  {
    deviceCode: 'REG-TAB-02',
    deviceName: 'Registrar Records Room Kiosk',
    serialNumber: 'SN-REG-0002',
    locationCode: 'REG-LOC-02',
    departmentCode: 'REG',
  },
  {
    deviceCode: 'LIB-TAB-01',
    deviceName: 'Library Circulation Desk Kiosk',
    serialNumber: 'SN-LIB-0001',
    locationCode: 'LIB-LOC-01',
    departmentCode: 'LIB',
  },
  {
    deviceCode: 'LIB-TAB-02',
    deviceName: 'Library Reading Hall Kiosk',
    serialNumber: 'SN-LIB-0002',
    locationCode: 'LIB-LOC-02',
    departmentCode: 'LIB',
  },
];

/**
 * Idempotent: upserts each sample tablet by its unique deviceCode, keyed
 * to whichever Registrar/Library location currently exists.
 * activationToken is only ever set on first insert ($setOnInsert) —
 * re-running the seeder must not silently rotate a tablet's existing
 * activation token out from under it.
 */
export async function seedTablets() {
  const departmentCodes = [...new Set(TABLETS.map((tablet) => tablet.departmentCode))];
  const departments = await Department.find({ code: { $in: departmentCodes } });
  const departmentIdByCode = Object.fromEntries(
    departments.map((department) => [department.code, department._id]),
  );

  const locationCodes = TABLETS.map((tablet) => tablet.locationCode);
  const locations = await Location.find({ code: { $in: locationCodes } });
  const locationByCode = Object.fromEntries(
    locations.map((location) => [location.code, location]),
  );

  let seededCount = 0;

  for (const tablet of TABLETS) {
    const departmentId = departmentIdByCode[tablet.departmentCode];
    const location = locationByCode[tablet.locationCode];

    if (!departmentId || !location) {
      continue;
    }

    await Tablet.findOneAndUpdate(
      { deviceCode: tablet.deviceCode },
      {
        $set: {
          deviceName: tablet.deviceName,
          serialNumber: tablet.serialNumber,
          locationId: location._id,
          departmentId,
          isActive: true,
        },
        $setOnInsert: { activationToken: generateActivationToken() },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    seededCount += 1;
  }

  return { tabletCount: seededCount };
}
