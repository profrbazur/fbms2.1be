import mongoose from 'mongoose';

export const QUESTION_TYPES = ['rating', 'yes_no', 'multiple_choice', 'short_text', 'long_text'];

// V2.5 — the three standardized management dimensions
// (backend/docs/v2/V2_5_SERVICE_QUALITY.md). Canonical identifiers only —
// never inferred from question wording, which may legitimately differ by
// Office while mapping to the same category.
export const SERVICE_QUALITY_CATEGORIES = ['courtesy', 'clarity', 'waiting_time'];

/**
 * A Question belongs to exactly one Survey and is never shared between
 * surveys (per this phase's design principles) — no question-bank
 * concept exists in Version 1. `options` only applies to
 * `multiple_choice` (validated in questionService.js, since the check
 * depends on `questionType`, a sibling field); `rating` is always a
 * fixed 1-5 scale with no stored options.
 */
const questionSchema = new mongoose.Schema(
  {
    surveyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Survey',
      required: true,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    questionType: {
      type: String,
      enum: QUESTION_TYPES,
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      required: true,
    },
    options: {
      type: [String],
      default: [],
    },
    // V2.5 — optional standardized management-dimension mapping
    // (questionService.js's assertValidServiceQualityCategory enforces
    // this is only ever set on `rating` questions — a sibling-field
    // cross-check the schema's own `enum` can't express). `null` for
    // every question that isn't one of the three core dimensions (most
    // rating questions, and every non-rating question) — not every
    // question needs a category, per this phase's explicit "do not force
    // free-text/optional questions into an inappropriate category" rule.
    serviceQualityCategory: {
      type: String,
      enum: [...SERVICE_QUALITY_CATEGORIES, null],
      default: null,
    },
  },
  { timestamps: true },
);

questionSchema.index({ surveyId: 1, order: 1 });

const Question = mongoose.model('Question', questionSchema);

export default Question;
