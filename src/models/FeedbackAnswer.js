import mongoose from 'mongoose';
import { QUESTION_TYPES } from './Question.js';

/**
 * One answer to one Question within one FeedbackSession. `questionType`
 * is copied from the Question at submission time (per this phase's
 * design goals, "to preserve historical accuracy") — `questionId` is
 * still stored and populated for display (question text/options), but
 * the type itself is snapshotted so a session's answers remain
 * self-describing even if independently reasoned about without a join.
 *
 * `answer` is intentionally untyped (Mixed) since its shape depends on
 * `questionType` — rating (integer 1-5), yes_no (boolean),
 * multiple_choice (string, one of the question's options), short_text/
 * long_text (string). See feedbackService.js's
 * `validateAnswerForQuestion` for the cross-field validation this
 * requires (same reasoning as Question's own options/questionType
 * cross-check in questionService.js).
 */
const feedbackAnswerSchema = new mongoose.Schema(
  {
    feedbackSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeedbackSession',
      required: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    questionType: {
      type: String,
      enum: QUESTION_TYPES,
      required: true,
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

feedbackAnswerSchema.index({ feedbackSessionId: 1 });
feedbackAnswerSchema.index({ questionId: 1 });

const FeedbackAnswer = mongoose.model('FeedbackAnswer', feedbackAnswerSchema);

export default FeedbackAnswer;
