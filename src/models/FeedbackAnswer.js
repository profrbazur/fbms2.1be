import mongoose from 'mongoose';
import { QUESTION_TYPES, SERVICE_QUALITY_CATEGORIES } from './Question.js';

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
 *
 * V2.5 — `serviceQualityCategory` is snapshotted from the answered
 * Question at submission time, the same "copy now, never re-derive
 * later" reasoning as `questionType` above. This is the historical-
 * integrity mechanism backend/docs/v2/V2_5_SERVICE_QUALITY.md requires:
 * a Question's own `serviceQualityCategory` can change after this
 * answer was recorded (a survey can be unpublished, edited, and
 * republished — questionService.js's assertParentSurveyEditable only
 * blocks edits while published), but this snapshot never does, so
 * service-quality analytics over historical answers stay trustworthy
 * regardless of any later Question edit. `null` for every answer to a
 * question with no category mapping — analytics must skip these, never
 * misclassify them (see analyticsService.js's getServiceQualityAverages).
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
    serviceQualityCategory: {
      type: String,
      enum: [...SERVICE_QUALITY_CATEGORIES, null],
      default: null,
    },
  },
  { timestamps: true },
);

feedbackAnswerSchema.index({ feedbackSessionId: 1 });
feedbackAnswerSchema.index({ questionId: 1 });

const FeedbackAnswer = mongoose.model('FeedbackAnswer', feedbackAnswerSchema);

export default FeedbackAnswer;
