import mongoose from 'mongoose';

/**
 * A Survey is exactly one of: Global (departmentId/locationId both
 * null), Department-scoped (departmentId set, locationId null), or
 * Location-scoped (locationId set; departmentId is always derived
 * server-side from that location — never accepted directly from a
 * client request, mirroring the Tablet model's departmentId
 * derivation). See surveyService.js for the enforcement.
 *
 * `questionCount` is a denormalized counter maintained by
 * surveyService.js's createQuestionForSurvey (atomic $inc) rather than
 * computed via a $lookup aggregate on every list request. This is safe
 * specifically because Version 1 has no question-delete endpoint — the
 * count can only ever go up, so there is no decrement path to keep in
 * sync.
 */
const surveySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    questionCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

surveySchema.index({ departmentId: 1 });
surveySchema.index({ locationId: 1 });

/**
 * Convenience read-only field so the frontend never has to re-derive
 * "Global / Department / Location" from the raw id fields itself.
 */
surveySchema.virtual('assignmentType').get(function assignmentType() {
  if (this.locationId) return 'location';
  if (this.departmentId) return 'department';
  return 'global';
});

/**
 * Convenience read-only field mirroring the three lifecycle states this
 * phase's instructions describe in prose (draft / published / archived)
 * without storing a redundant, independently-settable status string
 * that could drift from isPublished/isArchived.
 */
surveySchema.virtual('status').get(function status() {
  if (this.isArchived) return 'archived';
  if (this.isPublished) return 'published';
  return 'draft';
});

const Survey = mongoose.model('Survey', surveySchema);

export default Survey;
