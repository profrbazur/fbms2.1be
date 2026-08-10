import mongoose from 'mongoose';

export const SERVICE_SESSION_STATUSES = ['active', 'ended'];

/**
 * V2.4 — represents a single staff member serving at a Tablet/Location
 * during a time interval, opened by a validated Staff PIN and closed by
 * an explicit logout (see backend/docs/v2/V2_4_STAFF_PIN_SERVICE_SESSION.md).
 * The sole writer is personnelService.js's startServiceSession/
 * endServiceSession, both reachable only through the device-authenticated
 * /api/v2/mobile/staff/* endpoints — never through the admin JWT API,
 * which is read-only for this collection (see docs/v2's Authorization
 * section: ServiceSession mutation belongs to the PIN mechanism, not
 * administrative roles).
 *
 * departmentId/buildingId/locationId/tabletId are snapshotted at session
 * start from the tablet's own location chain (mirroring FeedbackSession's
 * own departmentId-from-tablet derivation) so a session's context never
 * silently drifts if the Tablet is later reassigned to a different
 * Location/Building — the same "never infer historical state from a
 * current mutable relationship" principle this phase's historical
 * attribution requirement is built on.
 */
const serviceSessionSchema = new mongoose.Schema(
  {
    personnelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Personnel',
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    tabletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tablet',
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: SERVICE_SESSION_STATUSES,
      default: 'active',
    },
  },
  { timestamps: true },
);

serviceSessionSchema.index({ personnelId: 1, startedAt: -1 });
serviceSessionSchema.index({ departmentId: 1, startedAt: -1 });
serviceSessionSchema.index({ tabletId: 1, startedAt: -1 });

// Enforces the One Active Session Rule (docs/v2) at the database level —
// a partial unique index so only ONE 'active' ServiceSession can ever
// exist per tabletId at a time, closing the race window a service-layer
// "check then create" alone would leave open. Ended sessions are excluded
// from the filter, so a tablet can accumulate unlimited ended history.
serviceSessionSchema.index(
  { tabletId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

const ServiceSession = mongoose.model('ServiceSession', serviceSessionSchema);

export default ServiceSession;
