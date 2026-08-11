import ServiceType from '../models/ServiceType.js';
import Department from '../models/Department.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { isGlobalReadRole } from '../utils/roleScope.js';

/**
 * Department Head/Personnel are always pinned to their own department and
 * to active-only results, regardless of what departmentId/isActive the
 * client supplied — mirrors locationService.listLocations exactly (see
 * docs/ARCHITECTURE.md's "never trust a client-provided department"
 * principle).
 */
export async function listServiceTypes(
  user,
  { departmentId, isActive, search, page = 1, limit = 20 } = {},
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
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }
  } else {
    if (!user.departmentId) {
      return { serviceTypes: [], pagination: { page: 1, limit: Number(limit) || 20, total: 0, pages: 0 } };
    }
    filter.departmentId = user.departmentId;
    filter.isActive = true;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$or = [{ name: regex }, { code: regex }];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [serviceTypes, total] = await Promise.all([
    ServiceType.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limitNum),
    ServiceType.countDocuments(filter),
  ]);

  return {
    serviceTypes,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

export async function getServiceTypeById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Service type not found.');
  }

  const serviceType = await ServiceType.findById(id);

  if (!serviceType) {
    throw new ApiError(404, 'Service type not found.');
  }

  if (!isGlobalReadRole(user.role)) {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    const belongsToOwnDepartment = ownDepartmentId === serviceType.departmentId.toString();

    if (!belongsToOwnDepartment || !serviceType.isActive) {
      throw new ApiError(403, 'You do not have access to this service type.');
    }
  }

  return serviceType;
}

/** Shared with createServiceType/updateServiceType — mirrors locationService.assertDepartmentIsUsable. */
async function assertDepartmentIsUsable(departmentId) {
  if (!isValidObjectId(departmentId)) {
    throw new ApiError(400, 'departmentId must be a valid id.', [
      { field: 'departmentId', message: 'Invalid department id.' },
    ]);
  }

  const department = await Department.findById(departmentId);

  if (!department) {
    throw new ApiError(400, 'Referenced department does not exist.', [
      { field: 'departmentId', message: 'Department does not exist.' },
    ]);
  }

  if (!department.isActive) {
    throw new ApiError(400, 'Cannot assign a service type to an inactive department.', [
      { field: 'departmentId', message: 'Department is inactive.' },
    ]);
  }
}

async function assertNoDuplicateCode(departmentId, code, excludeId) {
  const normalizedCode = code.trim().toUpperCase();
  const query = { departmentId, code: normalizedCode };
  if (excludeId) query._id = { $ne: excludeId };

  const duplicate = await ServiceType.findOne(query);
  if (duplicate) {
    throw new ApiError(409, 'A service type with that code already exists in this department.');
  }
}

export async function createServiceType(payload) {
  const { departmentId, name, code, description = '', isActive = true, sortOrder = 0 } = payload;

  await assertDepartmentIsUsable(departmentId);
  await assertNoDuplicateCode(departmentId, code);

  const serviceType = await ServiceType.create({
    departmentId,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    description,
    isActive,
    sortOrder,
  });

  return serviceType;
}

export async function updateServiceType(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Service type not found.');
  }

  const serviceType = await ServiceType.findById(id);

  if (!serviceType) {
    throw new ApiError(404, 'Service type not found.');
  }

  // departmentId is intentionally immutable after creation — moving a
  // Service Type to a different department would silently reinterpret
  // every FeedbackSession that already snapshotted this serviceTypeId
  // under its original department (see FeedbackSession.serviceTypeId's
  // own doc comment). Not in ALLOWED_FIELDS for update at the validator
  // layer either; this is a defense-in-depth backstop.
  if (updates.departmentId !== undefined && updates.departmentId !== serviceType.departmentId.toString()) {
    throw new ApiError(400, 'departmentId cannot be changed after a service type is created.', [
      { field: 'departmentId', message: 'departmentId is immutable.' },
    ]);
  }

  if (updates.code !== undefined) {
    await assertNoDuplicateCode(serviceType.departmentId, updates.code, serviceType._id);
    serviceType.code = updates.code.trim().toUpperCase();
  }

  if (updates.name !== undefined) serviceType.name = updates.name.trim();
  if (updates.description !== undefined) serviceType.description = updates.description;
  if (updates.isActive !== undefined) serviceType.isActive = updates.isActive;
  if (updates.sortOrder !== undefined) serviceType.sortOrder = updates.sortOrder;

  await serviceType.save();

  return serviceType;
}

/**
 * The anti-spoofing gate for mobile feedback submission (V2.6 —
 * feedbackService.createFeedbackSession): a client selects a
 * serviceTypeId, but the server must independently confirm it exists,
 * is active, and belongs to the SAME department as the submitting
 * tablet before ever storing it. A Library tablet cannot submit a
 * Registrar service type, and vice versa.
 */
export async function assertServiceTypeIsUsable(serviceTypeId, departmentId) {
  if (!isValidObjectId(serviceTypeId)) {
    throw new ApiError(400, 'serviceTypeId must be a valid id.', [
      { field: 'serviceTypeId', message: 'Invalid service type id.' },
    ]);
  }

  const serviceType = await ServiceType.findById(serviceTypeId);

  if (!serviceType) {
    throw new ApiError(400, 'Referenced service type does not exist.', [
      { field: 'serviceTypeId', message: 'Service type does not exist.' },
    ]);
  }

  if (!serviceType.isActive) {
    throw new ApiError(400, 'Cannot submit feedback for an inactive service type.', [
      { field: 'serviceTypeId', message: 'Service type is inactive.' },
    ]);
  }

  if (serviceType.departmentId.toString() !== departmentId.toString()) {
    throw new ApiError(400, 'Service type does not belong to this department.', [
      { field: 'serviceTypeId', message: "Service type does not belong to the tablet's department." },
    ]);
  }

  return serviceType;
}

/**
 * Device-authenticated read for the V2 mobile kiosk flow (GET
 * /api/v2/mobile/service-types) — there is no `user`/role here, only
 * `req.tablet`, so this intentionally bypasses listServiceTypes' JWT
 * role-scoping and always returns just the tablet's own department's
 * active, orderable options.
 */
export async function listActiveServiceTypesForDepartment(departmentId) {
  return ServiceType.find({ departmentId, isActive: true }).sort({ sortOrder: 1, name: 1 });
}
