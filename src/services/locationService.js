import Location from '../models/Location.js';
import Department from '../models/Department.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';

/**
 * Department Head/Personnel are always pinned to their own department and
 * to active-only results, regardless of what departmentId/isActive the
 * client supplied — per docs/ARCHITECTURE.md's "never trust a
 * client-provided department" principle. A supplied departmentId query
 * parameter cannot be used to bypass this restriction.
 */
export async function listLocations(
  user,
  { departmentId, isActive, search, page = 1, limit = 20 } = {},
) {
  const filter = {};

  if (user.role === 'super_admin') {
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
      return { locations: [], pagination: { page: 1, limit: Number(limit) || 20, total: 0, pages: 0 } };
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

  const [locations, total] = await Promise.all([
    Location.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum),
    Location.countDocuments(filter),
  ]);

  return {
    locations,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

export async function getLocationById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Location not found.');
  }

  const location = await Location.findById(id);

  if (!location) {
    throw new ApiError(404, 'Location not found.');
  }

  if (user.role !== 'super_admin') {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    const belongsToOwnDepartment = ownDepartmentId === location.departmentId.toString();

    if (!belongsToOwnDepartment || !location.isActive) {
      throw new ApiError(403, 'You do not have access to this location.');
    }
  }

  return location;
}

/**
 * Shared with personnelService.js — a department must exist and be
 * active before anything (a Location or a Personnel record) can be
 * assigned to it.
 */
export async function assertDepartmentIsUsable(departmentId) {
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
    throw new ApiError(400, 'Cannot assign a location to an inactive department.', [
      { field: 'departmentId', message: 'Department is inactive.' },
    ]);
  }
}

/**
 * Shared with tabletService.js/surveyService.js — a location must exist
 * and be active before anything (a Tablet or a location-scoped Survey)
 * can be assigned to it.
 */
export async function assertLocationIsUsable(locationId) {
  if (!isValidObjectId(locationId)) {
    throw new ApiError(400, 'locationId must be a valid id.', [
      { field: 'locationId', message: 'Invalid location id.' },
    ]);
  }

  const location = await Location.findById(locationId);

  if (!location) {
    throw new ApiError(400, 'Referenced location does not exist.', [
      { field: 'locationId', message: 'Location does not exist.' },
    ]);
  }

  if (!location.isActive) {
    throw new ApiError(400, 'Cannot assign to an inactive location.', [
      { field: 'locationId', message: 'Location is inactive.' },
    ]);
  }

  return location;
}

async function assertNoDuplicateCode(code, excludeId) {
  const normalizedCode = code.trim().toUpperCase();
  const query = { code: normalizedCode };
  if (excludeId) query._id = { $ne: excludeId };

  const duplicate = await Location.findOne(query);
  if (duplicate) {
    throw new ApiError(409, 'A location with that code already exists.');
  }
}

export async function createLocation(payload) {
  const { name, code, description = '', departmentId, isActive = true } = payload;

  await assertDepartmentIsUsable(departmentId);
  await assertNoDuplicateCode(code);

  const location = await Location.create({
    name: name.trim(),
    code: code.trim().toUpperCase(),
    description,
    departmentId,
    isActive,
  });

  return location;
}

export async function updateLocation(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Location not found.');
  }

  const location = await Location.findById(id);

  if (!location) {
    throw new ApiError(404, 'Location not found.');
  }

  if (updates.departmentId !== undefined) {
    await assertDepartmentIsUsable(updates.departmentId);
  }

  if (updates.code !== undefined) {
    await assertNoDuplicateCode(updates.code, location._id);
    location.code = updates.code.trim().toUpperCase();
  }

  if (updates.name !== undefined) location.name = updates.name.trim();
  if (updates.description !== undefined) location.description = updates.description;
  if (updates.departmentId !== undefined) location.departmentId = updates.departmentId;
  if (updates.isActive !== undefined) location.isActive = updates.isActive;

  await location.save();

  return location;
}
