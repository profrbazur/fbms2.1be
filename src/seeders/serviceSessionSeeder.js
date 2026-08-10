import Personnel from '../models/Personnel.js';
import Tablet from '../models/Tablet.js';
import Location from '../models/Location.js';
import ServiceSession from '../models/ServiceSession.js';

/**
 * V2.4 — small, deterministic set of sample ServiceSessions exercising:
 * multiple Personnel serving at the same tablet over time (Tablet
 * reuse — REG-TAB-01 below), Department isolation (Registrar vs.
 * Library sessions never share a tabletId), a mix of ended and one
 * still-active session, and historical attribution
 * (feedbackSeeder.js attributes several seeded FeedbackSessions to the
 * ended sessions here by employeeNumber). Five sessions are deliberately
 * left un-attributed to any feedback (see feedbackSeeder.js's own
 * comment) to also exercise "existing feedback without ServiceSession
 * remains readable."
 */
const SERVICE_SESSIONS = [
  {
    employeeNumber: 'REG-0002',
    tabletDeviceCode: 'REG-TAB-01',
    startedAt: '2026-07-20T09:00:00.000Z',
    endedAt: '2026-07-20T09:20:00.000Z',
  },
  {
    employeeNumber: 'REG-0003',
    tabletDeviceCode: 'REG-TAB-01',
    startedAt: '2026-07-22T13:00:00.000Z',
    endedAt: '2026-07-22T13:15:00.000Z',
  },
  {
    employeeNumber: 'REG-0004',
    tabletDeviceCode: 'REG-TAB-02',
    startedAt: '2026-07-24T10:30:00.000Z',
    endedAt: '2026-07-24T10:50:00.000Z',
  },
  {
    employeeNumber: 'LIB-0002',
    tabletDeviceCode: 'LIB-TAB-01',
    startedAt: '2026-07-25T14:00:00.000Z',
    endedAt: '2026-07-25T14:30:00.000Z',
  },
  {
    employeeNumber: 'LIB-0003',
    tabletDeviceCode: 'LIB-TAB-02',
    startedAt: '2026-07-27T10:45:00.000Z',
    endedAt: '2026-07-27T11:15:00.000Z',
  },
  {
    employeeNumber: 'LIB-0004',
    tabletDeviceCode: 'LIB-TAB-01',
    startedAt: '2026-08-08T09:00:00.000Z',
    endedAt: null,
  },
];

/**
 * Idempotent: each session is matched/upserted by its natural key —
 * (personnelId, tabletId, startedAt) — the same "own stable business
 * key" convention feedbackSeeder.js uses for referenceCode. Sessions
 * referencing a Personnel/Tablet/Location that doesn't exist yet are
 * safely skipped, matching every other seeder's own
 * "skip if a dependency is missing" convention.
 */
export async function seedServiceSessions() {
  let sessionCount = 0;

  for (const definition of SERVICE_SESSIONS) {
    const personnel = await Personnel.findOne({ employeeNumber: definition.employeeNumber });
    const tablet = await Tablet.findOne({ deviceCode: definition.tabletDeviceCode });

    if (!personnel || !tablet) {
      continue;
    }

    const location = await Location.findById(tablet.locationId);
    if (!location) {
      continue;
    }

    await ServiceSession.findOneAndUpdate(
      {
        personnelId: personnel._id,
        tabletId: tablet._id,
        startedAt: new Date(definition.startedAt),
      },
      {
        $set: {
          departmentId: tablet.departmentId,
          buildingId: location.buildingId,
          locationId: tablet.locationId,
          endedAt: definition.endedAt ? new Date(definition.endedAt) : null,
          status: definition.endedAt ? 'ended' : 'active',
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    sessionCount += 1;
  }

  return { sessionCount };
}
