import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
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
    // V2.8 (Satisfaction KPI Targets) — optional override of
    // OrganizationSettings.defaultSatisfactionTarget for this specific
    // Office/Department. `null` (the default) means "no override, use the
    // organization default" — never a second implicit target value.
    satisfactionTarget: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
  },
  { timestamps: true },
);

const Department = mongoose.model('Department', departmentSchema);

export default Department;
