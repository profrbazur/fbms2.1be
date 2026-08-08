import mongoose from 'mongoose';

export const FEEDBACK_SESSION_STATUSES = ['completed'];

/**
 * A FeedbackSession is the permanent record of one anonymous, completed
 * survey response collected from a tablet. Version 1 only ever creates
 * `completed` sessions (no partial/abandoned-session tracking yet), and
 * once created a session is never edited or deleted anywhere in this
 * phase's endpoint list — see feedbackService.js.
 *
 * `departmentId` is always derived server-side from the tablet's own
 * `locationId` → `departmentId` chain (mirroring Tablet's own
 * departmentId derivation, ADR-022/ADR-023's sibling pattern), never
 * from the session's `surveyId` — a Global survey answered from a
 * Library tablet still belongs to the Library department, since
 * departmentId represents where the feedback was physically collected.
 *
 * `referenceCode` (e.g. "FB-2026-000001") is a server-generated,
 * human-readable identifier — introduced in this phase since sessions
 * are anonymous and have no reporter name to search or display by; see
 * docs/DECISIONS.md.
 */
const feedbackSessionSchema = new mongoose.Schema(
  {
    referenceCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    surveyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Survey',
      required: true,
    },
    tabletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tablet',
      required: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    submittedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      required: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: FEEDBACK_SESSION_STATUSES,
      default: 'completed',
    },
  },
  { timestamps: true },
);

feedbackSessionSchema.index({ departmentId: 1, submittedAt: -1 });
feedbackSessionSchema.index({ surveyId: 1 });
feedbackSessionSchema.index({ locationId: 1 });
feedbackSessionSchema.index({ tabletId: 1 });

const FeedbackSession = mongoose.model('FeedbackSession', feedbackSessionSchema);

export default FeedbackSession;
