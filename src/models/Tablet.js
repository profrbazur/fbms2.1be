import mongoose from 'mongoose';

/**
 * departmentId is always derived server-side from locationId (see
 * tabletService.js) — never accepted directly from a client request, per
 * this phase's "departmentId (derived from location)" design note.
 * activationToken is generated server-side (generateActivationToken.js)
 * and stored in plaintext (not hashed): unlike a User password, it is a
 * device-pairing credential the Super Admin must be able to view/copy
 * again from the Tablets list, and it can be invalidated at any time via
 * the regenerate-token endpoint. See docs/DECISIONS.md for the full
 * rationale.
 *
 * `deviceSecretHash`/`activationConsumedAt` (P5.1) belong to the Android
 * kiosk's own authentication lifecycle — see mobileService.js and
 * docs/MOBILE_PROTOCOL.md. Unlike `activationToken`, the Device Secret
 * is never redisplayed to a human after activation, so — unlike ADR-022's
 * reasoning for `activationToken` — a one-way hash is the right choice
 * here, mirroring `User.passwordHash` (ADR-031).
 */
const tabletSchema = new mongoose.Schema(
  {
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    deviceCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    serialNumber: {
      type: String,
      trim: true,
      default: '',
    },
    activationToken: {
      type: String,
      required: true,
      unique: true,
    },
    // Set once a successful POST /api/v1/mobile/activate consumes this
    // tablet's current activationToken — makes the token single-use
    // without needing a sparse-unique-null dance on activationToken
    // itself (see mobileService.js). Cleared back to null whenever the
    // token is regenerated (tabletService.regenerateActivationToken),
    // re-enabling activation with the fresh token.
    activationConsumedAt: {
      type: Date,
      default: null,
    },
    // SHA-256 hash of the tablet's permanent mobile credential — never
    // the plaintext value, and never selected by default (mirrors
    // User.passwordHash). Deliberately no `default: null` — the sparse
    // unique index below only excludes documents where the field is
    // entirely ABSENT, not documents storing an explicit `null` (the
    // same reasoning as Personnel.userId — see docs/DATA_MODEL.md).
    // Un-activated tablets must omit the key entirely; set on successful
    // activation, unset (`undefined`, not `null`) whenever the
    // activation token is regenerated, since select:false already keeps
    // it out of every JSON response regardless of presence.
    deviceSecretHash: {
      type: String,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    appVersion: {
      type: String,
      trim: true,
      default: '',
    },
    androidVersion: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
);

tabletSchema.index({ departmentId: 1, isActive: 1 });
tabletSchema.index({ locationId: 1 });
// sparse: most tablets are never activated (deviceSecretHash stays
// null) — a plain unique index would otherwise reject the second
// unactivated tablet as a duplicate null, the same reasoning as
// Personnel's userId sparse+unique index (see docs/DATA_MODEL.md).
tabletSchema.index({ deviceSecretHash: 1 }, { unique: true, sparse: true });
// Live Monitoring (P6.2) filters/sorts tablets by online/offline/inactive
// status, derived from lastSeen — justifies a dedicated index beyond the
// existing departmentId/isActive compound index above.
tabletSchema.index({ lastSeen: -1 });

const Tablet = mongoose.model('Tablet', tabletSchema);

export default Tablet;
