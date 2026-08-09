import Building from '../models/Building.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { isGlobalReadRole } from '../utils/roleScope.js';

async function assertNoDuplicate({ name, code }, excludeId) {
  const orConditions = [];

  if (name) {
    orConditions.push({ name: new RegExp(`^${escapeRegExp(name.trim())}$`, 'i') });
  }
  if (code) {
    orConditions.push({ code: code.trim().toUpperCase() });
  }

  if (orConditions.length === 0) return;

  const query = { $or: orConditions };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const duplicate = await Building.findOne(query);

  if (duplicate) {
    const field = duplicate.code === code?.trim().toUpperCase() ? 'code' : 'name';
    throw new ApiError(409, `A building with that ${field} already exists.`);
  }
}

/**
 * Unlike Department, a Building has no owning department to scope by —
 * the same physical building can host Locations across multiple
 * departments. Super Admin/Senior Leadership (global read roles) see
 * every building with an optional isActive filter; Department Head/
 * Personnel see only active buildings, mirroring locationService's own
 * non-global-read restriction (docs/v2/V2_3_BUILDING_LOCATION.md:
 * "Department Head: read relevant Building data as needed").
 */
export async function listBuildings(user, { isActive, search } = {}) {
  const filter = {};

  if (isGlobalReadRole(user.role)) {
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }
  } else {
    filter.isActive = true;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$or = [{ name: regex }, { code: regex }];
  }

  return Building.find(filter).sort({ name: 1 });
}

export async function getBuildingById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Building not found.');
  }

  const building = await Building.findById(id);

  if (!building) {
    throw new ApiError(404, 'Building not found.');
  }

  if (!isGlobalReadRole(user.role) && !building.isActive) {
    throw new ApiError(403, 'You do not have access to this building.');
  }

  return building;
}

export async function createBuilding(payload) {
  const { name, code, description = '', isActive = true } = payload;

  await assertNoDuplicate({ name, code });

  const building = await Building.create({
    name: name.trim(),
    code: code.trim().toUpperCase(),
    description,
    isActive,
  });

  return building;
}

export async function updateBuilding(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Building not found.');
  }

  const building = await Building.findById(id);

  if (!building) {
    throw new ApiError(404, 'Building not found.');
  }

  await assertNoDuplicate({ name: updates.name, code: updates.code }, building._id);

  if (updates.name !== undefined) building.name = updates.name.trim();
  if (updates.code !== undefined) building.code = updates.code.trim().toUpperCase();
  if (updates.description !== undefined) building.description = updates.description;
  if (updates.isActive !== undefined) building.isActive = updates.isActive;

  await building.save();

  return building;
}

/**
 * Shared with locationService.js — a building must exist and be active
 * before a Location can be assigned to it, mirroring
 * locationService.assertDepartmentIsUsable's exact convention.
 */
export async function assertBuildingIsUsable(buildingId) {
  if (!isValidObjectId(buildingId)) {
    throw new ApiError(400, 'buildingId must be a valid id.', [
      { field: 'buildingId', message: 'Invalid building id.' },
    ]);
  }

  const building = await Building.findById(buildingId);

  if (!building) {
    throw new ApiError(400, 'Referenced building does not exist.', [
      { field: 'buildingId', message: 'Building does not exist.' },
    ]);
  }

  if (!building.isActive) {
    throw new ApiError(400, 'Cannot assign a location to an inactive building.', [
      { field: 'buildingId', message: 'Building is inactive.' },
    ]);
  }
}
