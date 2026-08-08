import mongoose from 'mongoose';

export const QUESTION_TYPES = ['rating', 'yes_no', 'multiple_choice', 'short_text', 'long_text'];

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
  },
  { timestamps: true },
);

questionSchema.index({ surveyId: 1, order: 1 });

const Question = mongoose.model('Question', questionSchema);

export default Question;
