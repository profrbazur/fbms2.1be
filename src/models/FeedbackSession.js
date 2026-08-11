import mongoose from 'mongoose';

export const FEEDBACK_SESSION_STATUSES = ['completed'];

/**
 * V2.7 — anonymous classification only (backend/docs/v2/
 * V2_7_RESPONDENT_TYPE.md), a fixed system list, not admin-configurable
 * reference data (contrast with ServiceType/Building, which both have an
 * explicit "## Model"/"## CRUD" section in their own planning docs; V2.7's
 * planning doc has neither). No name/ID number/employee number/email/
 * phone is ever collected alongside it.
 */
export const RESPONDENT_TYPES = ['student', 'employee', 'visitor'];

export const RESPONDENT_TYPE_LABELS = {
  student: 'Student',
  employee: 'Employee',
  visitor: 'Visitor',
};

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
 *
 * V2.4 — `serviceSessionId`/`personnelId`/`buildingId` are an optional,
 * additive historical-attribution snapshot (backend/docs/v2/
 * V2_4_STAFF_PIN_SERVICE_SESSION.md): only ever set by the
 * device-authenticated /api/v2/mobile/feedback path, when the submitting
 * tablet had an active ServiceSession. `default: null` (not an absent
 * key) so every session — old and new — always exposes the same field
 * shape in API responses; a pre-V2.4 or v1-submitted session simply reads
 * `personnelId: null`, which the frontend treats as "no staff attribution
 * available," never as an error. These are snapshotted at submission
 * time and never re-derived from the tablet's current state afterward —
 * a later Personnel/Tablet reassignment must never change what an
 * already-submitted FeedbackSession attributes.
 *
 * V2.6 — `serviceTypeId` is the same kind of optional, additive,
 * submission-time snapshot (backend/docs/v2/V2_6_SERVICE_TYPES.md),
 * except its origin differs from personnelId/serviceSessionId/buildingId:
 * those are always resolved server-side from the tablet's active
 * ServiceSession and never accepted from the client payload, whereas
 * serviceTypeId genuinely IS a client (respondent/kiosk) selection — the
 * server has no way to infer which transaction type a respondent is
 * rating. The anti-spoofing guarantee here is therefore not "never
 * accept from the client" but "always independently verify": every
 * serviceTypeId is checked by serviceTypeService.assertServiceTypeIsUsable
 * against the submitting tablet's own departmentId before being stored,
 * so a Library tablet can never attribute feedback to a Registrar
 * service type. Only ever set via POST /api/v2/mobile/feedback — v1
 * submissions have no such field in their request contract at all (see
 * validateMobile.js's v1-only FEEDBACK_FIELDS) and always get `null`
 * here. A later ServiceType rename/deactivation must never change what
 * an already-submitted FeedbackSession snapshotted.
 *
 * V2.7 — `respondentType` is a plain enum string, not an ObjectId
 * reference like serviceTypeId: RESPONDENT_TYPES is a fixed, closed set
 * with no separate mutable record (no name to rename, no active/inactive
 * lifecycle) for this field to snapshot against, so the enum value itself
 * is both the stored identity and the display value. Like serviceTypeId,
 * it genuinely is a client (respondent) selection, independently
 * validated against RESPONDENT_TYPES before being trusted (see
 * validateMobile.js) — but unlike serviceTypeId there is no
 * department-ownership check, since a Respondent Type is not owned by any
 * department. Optional even on V2 submissions (the planning doc's "may
 * include respondentType", contrasted with serviceTypeId's required
 * status) — forcing every respondent to self-classify would work against
 * the "anonymous, frictionless feedback" goal. Only ever set via POST
 * /api/v2/mobile/feedback; v1 submissions have no such field in their
 * request contract (validateMobile.js's v1-only FEEDBACK_FIELDS) and
 * always get `null` here.
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
    serviceSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceSession',
      default: null,
    },
    personnelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Personnel',
      default: null,
    },
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
    },
    serviceTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceType',
      default: null,
    },
    respondentType: {
      type: String,
      enum: [...RESPONDENT_TYPES, null],
      default: null,
    },
  },
  { timestamps: true },
);

feedbackSessionSchema.index({ departmentId: 1, submittedAt: -1 });
feedbackSessionSchema.index({ surveyId: 1 });
feedbackSessionSchema.index({ locationId: 1 });
feedbackSessionSchema.index({ tabletId: 1 });
feedbackSessionSchema.index({ personnelId: 1, submittedAt: -1 });
feedbackSessionSchema.index({ serviceSessionId: 1 });
feedbackSessionSchema.index({ serviceTypeId: 1, submittedAt: -1 });
feedbackSessionSchema.index({ respondentType: 1, submittedAt: -1 });

const FeedbackSession = mongoose.model('FeedbackSession', feedbackSessionSchema);

export default FeedbackSession;
