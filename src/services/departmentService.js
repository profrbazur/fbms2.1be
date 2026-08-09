import Department from '../models/Department.js';
import User from '../models/User.js';
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

  const duplicate = await Department.findOne(query);

  if (duplicate) {
    const field = duplicate.code === code?.trim().toUpperCase() ? 'code' : 'name';
    throw new ApiError(409, `A department with that ${field} already exists.`);
  }
}

/**
 * Department Head/Personnel are always restricted to their own
 * assigned department, never a client-supplied filter — resolved from
 * req.user by the caller (controller), not trusted input.
 */
export async function listDepartments(user, { isActive } = {}) {
  if (isGlobalReadRole(user.role)) {
    const filter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }
    return Department.find(filter).sort({ name: 1 });
  }

  if (!user.departmentId) {
    return [];
  }

  const department = await Department.findById(user.departmentId);
  return department ? [department] : [];
}

export async function getDepartmentById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Department not found.');
  }

  const department = await Department.findById(id);

  if (!department) {
    throw new ApiError(404, 'Department not found.');
  }

  if (!isGlobalReadRole(user.role)) {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    if (ownDepartmentId !== department._id.toString()) {
      throw new ApiError(403, 'You do not have access to this department.');
    }
  }

  return department;
}

export async function createDepartment(payload) {
  const { name, code, description = '', isActive = true } = payload;

  await assertNoDuplicate({ name, code });

  const department = await Department.create({
    name: name.trim(),
    code: code.trim().toUpperCase(),
    description,
    isActive,
  });

  return department;
}

export async function updateDepartment(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Department not found.');
  }

  const department = await Department.findById(id);

  if (!department) {
    throw new ApiError(404, 'Department not found.');
  }

  await assertNoDuplicate(
    { name: updates.name, code: updates.code },
    department._id,
  );

  if (updates.isActive === false && department.isActive === true) {
    const activeUserCount = await User.countDocuments({
      departmentId: department._id,
      isActive: true,
    });

    if (activeUserCount > 0) {
      throw new ApiError(
        409,
        `Cannot deactivate this department: ${activeUserCount} active user(s) are still assigned to it.`,
      );
    }
  }

  if (updates.name !== undefined) department.name = updates.name.trim();
  if (updates.code !== undefined) department.code = updates.code.trim().toUpperCase();
  if (updates.description !== undefined) department.description = updates.description;
  if (updates.isActive !== undefined) department.isActive = updates.isActive;

  await department.save();

  return department;
}
