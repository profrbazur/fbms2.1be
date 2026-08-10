import ServiceSession from '../models/ServiceSession.js';
import Location from '../models/Location.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import { verifyStaffPin } from './personnelService.js';

/**
 * V2.4 — POST /api/v2/mobile/staff/login. Validates the PIN against
 * Personnel scoped to the authenticated tablet's own department (see
 * personnelService.verifyStaffPin), then opens a ServiceSession snapshot
 * of the tablet's current Location/Building/Department chain. The
 * database-level partial unique index on ServiceSession (tabletId,
 * status: 'active') is the actual enforcement of the One Active Session
 * Rule — the pre-check below exists only to return a clean 409 with a
 * helpful message instead of a raw duplicate-key error.
 */
export async function startServiceSession(tablet, pin) {
  const personnel = await verifyStaffPin(tablet.departmentId, pin);

  if (!personnel) {
    throw new ApiError(401, 'Invalid PIN.');
  }

  const existingActive = await ServiceSession.findOne({ tabletId: tablet._id, status: 'active' });
  if (existingActive) {
    throw new ApiError(409, 'A staff member is already serving at this tablet. Log out first.');
  }

  const location = await Location.findById(tablet.locationId);
  if (!location) {
    throw new ApiError(409, 'This tablet\'s location is no longer available.');
  }

  let session;
  try {
    session = await ServiceSession.create({
      personnelId: personnel._id,
      departmentId: tablet.departmentId,
      buildingId: location.buildingId,
      locationId: tablet.locationId,
      tabletId: tablet._id,
      startedAt: new Date(),
      status: 'active',
    });
  } catch (error) {
    // Duplicate-key on the partial unique index — a second login raced
    // in between the pre-check above and this write.
    if (error?.code === 11000) {
      throw new ApiError(409, 'A staff member is already serving at this tablet. Log out first.');
    }
    throw error;
  }

  return { session, personnel };
}

/**
 * POST /api/v2/mobile/staff/logout. Ends the tablet's currently active
 * ServiceSession, if any. Feedback already submitted under this session
 * keeps its own snapshot untouched — ending the session only stops
 * future feedback from being attributed to it.
 */
export async function endServiceSession(tablet) {
  const session = await ServiceSession.findOne({ tabletId: tablet._id, status: 'active' });

  if (!session) {
    throw new ApiError(404, 'No active service session for this tablet.');
  }

  session.status = 'ended';
  session.endedAt = new Date();
  await session.save();

  return session;
}

/**
 * GET /api/v2/mobile/staff/active. Read-only status check so a
 * reconnecting/restarted kiosk client can resync its local UI state to
 * the backend's authoritative view instead of trusting stale local
 * state (the "stale ServiceSession" case from docs/v2's concurrency
 * rules). Returns `null`, never throws, when no session is active.
 */
export async function getActiveServiceSessionForTablet(tablet) {
  return ServiceSession.findOne({ tabletId: tablet._id, status: 'active' }).populate(
    'personnelId',
    'firstName middleName lastName suffix employeeNumber position',
  );
}

/**
 * Admin-facing GET /api/v1/service-sessions. Read-only — ServiceSession
 * mutation belongs exclusively to the device-authenticated Staff PIN
 * flow above, never the admin JWT API (see backend/docs/v2's
 * Authorization section). Department Head/Personnel are pinned to their
 * own department, matching every other listX(user, ...) function in this
 * codebase (tabletService/personnelService/feedbackService).
 */
export async function listServiceSessions(
  user,
  { departmentId, tabletId, personnelId, status, page = 1, limit = 20 } = {},
) {
  const filter = {};

  if (isGlobalReadRole(user.role)) {
    if (departmentId) {
      if (!isValidObjectId(departmentId)) {
        throw new ApiError(400, 'departmentId must be a valid id.', [
          { field: 'departmentId', message: 'Invalid department id.' },
        ]);
      }
      filter.departmentId = departmentId;
    }
  } else {
    if (!user.departmentId) {
      return { serviceSessions: [], pagination: { page: 1, limit: parsePositiveInt(limit, 20), total: 0, pages: 0 } };
    }
    filter.departmentId = user.departmentId;
  }

  if (tabletId) {
    if (!isValidObjectId(tabletId)) {
      throw new ApiError(400, 'tabletId must be a valid id.', [
        { field: 'tabletId', message: 'Invalid tablet id.' },
      ]);
    }
    filter.tabletId = tabletId;
  }

  if (personnelId) {
    if (!isValidObjectId(personnelId)) {
      throw new ApiError(400, 'personnelId must be a valid id.', [
        { field: 'personnelId', message: 'Invalid personnel id.' },
      ]);
    }
    filter.personnelId = personnelId;
  }

  if (status) {
    if (!['active', 'ended'].includes(status)) {
      throw new ApiError(400, 'status must be "active" or "ended".', [
        { field: 'status', message: 'status must be "active" or "ended".' },
      ]);
    }
    filter.status = status;
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  const [serviceSessions, total] = await Promise.all([
    ServiceSession.find(filter)
      .populate('personnelId', 'firstName middleName lastName suffix employeeNumber position')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    ServiceSession.countDocuments(filter),
  ]);

  return {
    serviceSessions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

export async function getServiceSessionById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Service session not found.');
  }

  const session = await ServiceSession.findById(id).populate(
    'personnelId',
    'firstName middleName lastName suffix employeeNumber position',
  );

  if (!session) {
    throw new ApiError(404, 'Service session not found.');
  }

  if (!isGlobalReadRole(user.role)) {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    if (ownDepartmentId !== session.departmentId.toString()) {
      throw new ApiError(403, 'You do not have access to this service session.');
    }
  }

  return session;
}
