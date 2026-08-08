import mongoose from 'mongoose';

/**
 * Closed set of actions this phase actually instruments (see
 * auditService.js's call sites) — kept as an enum so an unrecognized
 * `action` filter value can be rejected with a controlled 400 rather
 * than silently matching nothing, and so a typo at a call site fails
 * loudly (schema validation) instead of writing an unfilterable record.
 */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'settings.update',
  'settings.logo_upload',
  'department.create',
  'department.update',
  'department.activate',
  'department.deactivate',
  'location.create',
  'location.update',
  'location.activate',
  'location.deactivate',
  'personnel.create',
  'personnel.update',
  'personnel.link',
  'personnel.unlink',
  'personnel.activate',
  'personnel.deactivate',
  'tablet.create',
  'tablet.update',
  'tablet.activate',
  'tablet.deactivate',
  'tablet.regenerate_token',
  'survey.create',
  'survey.update',
  'survey.publish',
  'survey.unpublish',
  'survey.archive',
  'question.create',
  'question.update',
  'developerPortal.reload_canonical_dataset',
];

export const AUDIT_ENTITY_TYPES = [
  'auth',
  'settings',
  'department',
  'location',
  'personnel',
  'tablet',
  'survey',
  'question',
  'developerPortal',
];

export const AUDIT_OUTCOMES = ['success', 'failure'];

/**
 * Append-only administrative history record (P8.1). Never written to by
 * a client-facing write endpoint — the only writer is
 * auditService.recordAuditEvent, called from existing feature
 * controllers after their own business operation already succeeded (see
 * docs/DECISIONS.md's audit-failure-strategy ADR). No update/delete path
 * exists anywhere in this codebase for this model, matching the same
 * "immutable by omission" pattern FeedbackSession established (ADR-027).
 *
 * actorUserId/actorDisplayName/actorEmail/actorRole are a deliberate,
 * small snapshot of the acting user at the moment of the action — kept
 * so a log entry stays meaningful even if that User's displayName/email/
 * role later changes, without needing to populate/join User on every
 * read (a User could even be deactivated later; the historical record
 * should still read correctly). entityLabel is the equivalent snapshot
 * for the affected resource (e.g. a Tablet's deviceName, a Survey's
 * title) — never the full resource document.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorDisplayName: {
      type: String,
      trim: true,
      default: '',
    },
    actorEmail: {
      type: String,
      trim: true,
      default: '',
    },
    actorRole: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
    },
    entityType: {
      type: String,
      enum: AUDIT_ENTITY_TYPES,
      required: true,
    },
    // Polymorphic across entityType (Department/Location/Personnel/
    // Tablet/Survey/Question/User) — deliberately no `ref`, since a
    // single static ref can't be correct for every entityType and this
    // phase never populates it (entityLabel already carries the
    // human-readable snapshot a details view needs).
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    entityLabel: {
      type: String,
      trim: true,
      default: '',
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    outcome: {
      type: String,
      enum: AUDIT_OUTCOMES,
      default: 'success',
    },
    // Small, intentional, sanitized context only — never a raw request
    // body dump. See auditService.js's sanitizeMetadata.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  // No updatedAt — an audit record is never updated after creation.
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Every list query sorts newest-first by default (see auditService.js);
// each compound index below puts createdAt second so a filtered-and-
// sorted query can use one index for both (ESR: Equality, Sort, Range).
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, createdAt: -1 });
auditLogSchema.index({ departmentId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
