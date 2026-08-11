import mongoose from 'mongoose';

/**
 * V2.6 — a configurable service/transaction category owned by exactly
 * one Department/Office (backend/docs/v2/V2_6_SERVICE_TYPES.md). Unlike
 * Location/Department, `code` (and therefore `name`) is only unique
 * *within* its owning department — the same label (e.g. "Clearance") is
 * a legitimate, independent Service Type in both Registrar and Library,
 * per that document's own examples. See the compound index below.
 */
const serviceTypeSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Department-scoped uniqueness (not global) — see this file's own doc
// comment. serviceTypeService.assertNoDuplicateCode enforces this with a
// friendly 409 before insert; this index is the database-level backstop.
serviceTypeSchema.index({ departmentId: 1, code: 1 }, { unique: true });
serviceTypeSchema.index({ departmentId: 1, isActive: 1, sortOrder: 1 });

const ServiceType = mongoose.model('ServiceType', serviceTypeSchema);

export default ServiceType;
