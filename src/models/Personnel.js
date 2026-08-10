import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const PIN_SALT_ROUNDS = 10;

/**
 * Personnel is an organizational record, deliberately separate from
 * User (authentication/authorization) per ADR-007 and this phase's
 * permanent scope decision (ADR-021) — see docs/DECISIONS.md. `userId`
 * is an optional, one-to-one link to an existing seeded User; nothing
 * here creates, edits, or deletes authentication credentials.
 */
const personnelSchema = new mongoose.Schema(
  {
    employeeNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    middleName: {
      type: String,
      trim: true,
      default: '',
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    suffix: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    contactNumber: {
      type: String,
      trim: true,
      default: '',
    },
    position: {
      type: String,
      required: true,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    // Optional, one-to-one. Deliberately no `default: null` — a sparse
    // unique index only excludes documents where the field is entirely
    // ABSENT, not documents storing an explicit `null`. Unlinked
    // records must omit the key on write (see personnelService.js) so
    // multiple unlinked records don't collide on the unique index.
    // toJSON below normalizes the absent field back to `null` so the
    // API contract always exposes `userId` (never an absent key).
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // V2.4 — bcrypt hash of the Personnel's 6-digit Staff PIN (see
    // backend/docs/v2/V2_4_STAFF_PIN_SERVICE_SESSION.md). bcrypt, not a
    // fast deterministic hash like Tablet.deviceSecretHash: a 6-digit PIN
    // only carries ~20 bits of entropy (1,000,000 possibilities), the
    // same low-entropy, human-facing-credential reasoning as
    // User.passwordHash (ADR-031) — not the high-entropy Device Secret
    // reasoning. select: false so a normal Personnel fetch never returns
    // it; verifyStaffPin() (personnelService.js) explicitly re-selects it.
    // Deliberately no `default: null` — omitted entirely until a PIN is
    // first provisioned, mirroring Tablet.deviceSecretHash.
    pinHash: {
      type: String,
      select: false,
    },
    // Public-safe indicator that a PIN has been provisioned, mirroring
    // Tablet.activationConsumedAt — lets the admin UI show "PIN set" /
    // "No PIN configured" without ever selecting pinHash. Cleared back to
    // null whenever the PIN is regenerated is not needed (regenerating
    // always immediately sets a new one), but stays null until the first
    // provisioning.
    pinSetAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        if (ret.userId === undefined) ret.userId = null;
        // Defense-in-depth alongside `select: false` above: `select`
        // only controls what a *query* fetches, not a field explicitly
        // assigned in memory (regeneratePersonnelPin sets
        // `personnel.pinHash` before saving) — without this, that
        // in-memory value would serialize straight into the API
        // response. Mirrors User's own passwordHash-stripping transform.
        delete ret.pinHash;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

personnelSchema.index({ userId: 1 }, { unique: true, sparse: true });
personnelSchema.index({ departmentId: 1, isActive: 1 });

// Mirrors User.hashPassword/comparePassword (jwt.js's sibling auth
// pattern) so PIN hashing follows the exact same static/method shape
// already established for the admin credential.
personnelSchema.static('hashPin', function hashPin(plainPin) {
  return bcrypt.hash(plainPin, PIN_SALT_ROUNDS);
});

personnelSchema.method('comparePin', function comparePin(plainPin) {
  if (!this.pinHash) return Promise.resolve(false);
  return bcrypt.compare(plainPin, this.pinHash);
});

/**
 * Recommended display order per this phase's instructions:
 * firstName middleName lastName suffix. A virtual (not a stored,
 * duplicated field) so there is one source of truth for each name part.
 */
personnelSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.middleName, this.lastName, this.suffix]
    .filter(Boolean)
    .join(' ');
});

const Personnel = mongoose.model('Personnel', personnelSchema);

export default Personnel;
