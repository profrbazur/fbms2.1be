import mongoose from 'mongoose';

/**
 * V2.3 — represents a physical campus/building (see
 * docs/v2/V2_3_BUILDING_LOCATION.md). Global master data, not scoped to
 * any Department — the same physical Building can host Locations
 * belonging to multiple departments. Mirrors Department's own schema
 * shape exactly (name/code/description/isActive/timestamps).
 */
const buildingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
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
  },
  { timestamps: true },
);

const Building = mongoose.model('Building', buildingSchema);

export default Building;
