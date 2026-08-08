import AuditLog, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AUDIT_OUTCOMES } from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { parseFilterDate } from '../utils/parseFilterDate.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';

const SENSITIVE_KEY_PATTERN = /password|secret|token|jwt|authoriz|cookie|hash/i;
const MAX_METADATA_DEPTH = 3;
const MAX_METADATA_ARRAY_LENGTH = 20;
const MAX_METADATA_STRING_LENGTH = 500;

function sanitizeMetadataValue(value, depth) {
  if (value === null || value === undefined) return undefined;
  if (depth > MAX_METADATA_DEPTH) return '[Truncated]';

  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? `${value.slice(0, MAX_METADATA_STRING_LENGTH)}…`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    // ObjectId/Date and similar simple wrapper objects are more useful
    // as their string form than as an opaque nested object.
    if (typeof value.toHexString === 'function' || value instanceof Date) {
      return value.toString();
    }

    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) return;
      const sanitized = sanitizeMetadataValue(val, depth + 1);
      if (sanitized !== undefined) result[key] = sanitized;
    });
    return result;
  }

  // Functions, symbols, Buffers, etc. — never worth persisting.
  return undefined;
}

/**
 * Defense-in-depth only — every call site below is expected to already
 * pass a small, intentional object (e.g. `{ changedFields: [...] }`),
 * never `req.body` itself. This strips anything sensitive-looking that
 * slips through anyway and bounds size so metadata can never become a
 * dumping ground.
 */
export function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const sanitized = sanitizeMetadataValue(metadata, 0);
  return sanitized && Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * The single writer of AuditLog — every instrumented controller calls
 * this after its own business operation has already succeeded, never
 * before. Deliberately never throws: see docs/DECISIONS.md's audit
 * failure strategy ADR. A failed audit write is logged to the server
 * console for operator visibility and otherwise swallowed — the
 * administrative operation the caller just completed must not be
 * rolled back or reported as failed because of it.
 */
export async function recordAuditEvent({
  actor,
  action,
  entityType,
  entityId = null,
  entityLabel = '',
  departmentId = null,
  outcome = 'success',
  metadata,
  req,
} = {}) {
  try {
    await AuditLog.create({
      actorUserId: actor?._id ?? null,
      actorDisplayName: actor?.displayName ?? 'System',
      actorEmail: actor?.email ?? '',
      actorRole: actor?.role ?? null,
      action,
      entityType,
      entityId,
      entityLabel,
      departmentId: departmentId ?? actor?.departmentId ?? null,
      outcome,
      metadata: sanitizeMetadata(metadata),
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] ?? '').slice(0, 300) || null,
    });
  } catch (error) {
    console.error(`[audit] Failed to record "${action}" event:`, error.message);
  }
}

/**
 * Shared by every instrumented controller that toggles a resource's
 * `isActive` alongside other, ordinary field edits — a single PATCH
 * that only flips isActive reads better in the audit trail as
 * "activated"/"deactivated" than as a generic "updated".
 */
export function resolveLifecycleAction(resource, wasActive, isActiveNow) {
  if (wasActive === undefined || isActiveNow === undefined || wasActive === isActiveNow) {
    return `${resource}.update`;
  }
  return isActiveNow ? `${resource}.activate` : `${resource}.deactivate`;
}

/**
 * Super Admin only (enforced by routes/audit/index.js) — Version 1 does
 * not department-scope Audit Logs (see docs/API_CONTRACT.md), so this
 * function performs no role-based filtering of its own, unlike every
 * other module's listX(user, ...) functions.
 */
export async function listAuditLogs({
  search,
  actorUserId,
  action,
  entityType,
  departmentId,
  outcome,
  dateFrom,
  dateTo,
  page = 1,
  limit = 20,
} = {}) {
  const filter = {};

  if (actorUserId) {
    if (!isValidObjectId(actorUserId)) {
      throw new ApiError(400, 'actorUserId must be a valid id.', [
        { field: 'actorUserId', message: 'Invalid user id.' },
      ]);
    }
    filter.actorUserId = actorUserId;
  }

  if (departmentId) {
    if (!isValidObjectId(departmentId)) {
      throw new ApiError(400, 'departmentId must be a valid id.', [
        { field: 'departmentId', message: 'Invalid department id.' },
      ]);
    }
    filter.departmentId = departmentId;
  }

  if (action) {
    if (!AUDIT_ACTIONS.includes(action)) {
      throw new ApiError(400, 'action is not a recognized audit action.', [
        { field: 'action', message: `action must be one of: ${AUDIT_ACTIONS.join(', ')}.` },
      ]);
    }
    filter.action = action;
  }

  if (entityType) {
    if (!AUDIT_ENTITY_TYPES.includes(entityType)) {
      throw new ApiError(400, 'entityType is not recognized.', [
        { field: 'entityType', message: `entityType must be one of: ${AUDIT_ENTITY_TYPES.join(', ')}.` },
      ]);
    }
    filter.entityType = entityType;
  }

  if (outcome) {
    if (!AUDIT_OUTCOMES.includes(outcome)) {
      throw new ApiError(400, 'outcome is not recognized.', [
        { field: 'outcome', message: `outcome must be one of: ${AUDIT_OUTCOMES.join(', ')}.` },
      ]);
    }
    filter.outcome = outcome;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = parseFilterDate(dateFrom, 'dateFrom');
    if (dateTo) filter.createdAt.$lte = parseFilterDate(dateTo, 'dateTo');
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$or = [{ actorDisplayName: regex }, { actorEmail: regex }, { entityLabel: regex }];
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  // _id as the tiebreaker keeps sort order stable (deterministic) for
  // any two records created within the same millisecond.
  const [auditLogs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limitNum),
    AuditLog.countDocuments(filter),
  ]);

  return {
    auditLogs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

export async function getAuditLogById(id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Audit log entry not found.');
  }

  const auditLog = await AuditLog.findById(id);

  if (!auditLog) {
    throw new ApiError(404, 'Audit log entry not found.');
  }

  return auditLog;
}
