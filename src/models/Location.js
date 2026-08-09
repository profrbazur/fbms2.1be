import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
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
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    // V2.3 — a Location is now the precise service point/window within a
    // physical Building (docs/v2/V2_3_BUILDING_LOCATION.md): the same
    // Department can have Locations across multiple Buildings, and the
    // same Building can host Locations belonging to multiple
    // Departments. Required at the schema level since every Location
    // this codebase ever creates goes through locationService.createLocation
    // (which now requires it) or organizationSeeder.js's seedLocations
    // (updated in the same phase) — there is no other Location writer.
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

locationSchema.index({ departmentId: 1, isActive: 1 });
locationSchema.index({ buildingId: 1, isActive: 1 });

const Location = mongoose.model('Location', locationSchema);

export default Location;
