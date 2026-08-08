import mongoose from 'mongoose';

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
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        if (ret.userId === undefined) ret.userId = null;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

personnelSchema.index({ userId: 1 }, { unique: true, sparse: true });
personnelSchema.index({ departmentId: 1, isActive: 1 });

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
