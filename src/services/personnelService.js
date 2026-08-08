import Personnel from '../models/Personnel.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';
import { assertDepartmentIsUsable } from './locationService.js';

const SORT_FIELDS = ['employeeNumber', 'firstName', 'lastName', 'position', 'createdAt'];

/**
 * Department Head/Personnel are always pinned to their own department,
 * regardless of what departmentId the client supplied — per
 * docs/ARCHITECTURE.md's "never trust a client-provided department"
 * principle, the same pattern applied to Locations in P3.0. Unlike
 * Locations, non-admins see both active and inactive personnel in
 * their own department (no isActive restriction — not required by
 * this phase's Authorization section).
 */
export async function listPersonnel(
  user,
  { departmentId, isActive, search, page = 1, limit = 20, sortBy = 'lastName', sortOrder = 'asc' } = {},
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
      return { personnel: [], pagination: { page: 1, limit: parsePositiveInt(limit, 20), total: 0, pages: 0 } };
    }
    filter.departmentId = user.departmentId;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$or = [
      { employeeNumber: regex },
      { firstName: regex },
      { middleName: regex },
      { lastName: regex },
      { email: regex },
      { position: regex },
    ];
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  const sortField = SORT_FIELDS.includes(sortBy) ? sortBy : 'lastName';
  const sortDirection = sortOrder === 'desc' ? -1 : 1;

  const [personnel, total] = await Promise.all([
    Personnel.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limitNum),
    Personnel.countDocuments(filter),
  ]);

  return {
    personnel,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

export async function getPersonnelById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Personnel record not found.');
  }

  const personnel = await Personnel.findById(id);

  if (!personnel) {
    throw new ApiError(404, 'Personnel record not found.');
  }

  if (user.role !== 'super_admin') {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    if (ownDepartmentId !== personnel.departmentId.toString()) {
      throw new ApiError(403, 'You do not have access to this personnel record.');
    }
  }

  return personnel;
}

async function assertNoDuplicatePersonnel({ employeeNumber, email }, excludeId) {
  const orConditions = [];

  if (employeeNumber) {
    orConditions.push({ employeeNumber: employeeNumber.trim().toUpperCase() });
  }
  if (email) {
    orConditions.push({ email: email.trim().toLowerCase() });
  }

  if (orConditions.length === 0) return;

  const query = { $or: orConditions };
  if (excludeId) query._id = { $ne: excludeId };

  const duplicate = await Personnel.findOne(query);

  if (duplicate) {
    const field =
      duplicate.employeeNumber === employeeNumber?.trim().toUpperCase() ? 'employeeNumber' : 'email';
    throw new ApiError(409, `A personnel record with that ${field} already exists.`);
  }
}

/**
 * Validates that `userId` may be linked to a Personnel record assigned
 * to `departmentId`: the user must exist, be active, not already be
 * linked to a different Personnel record, and belong to the same
 * department (Super Admin — whose departmentId is null — is exempt
 * from the department-match requirement).
 */
async function assertLinkableUser(userId, departmentId, excludePersonnelId) {
  if (!isValidObjectId(userId)) {
    throw new ApiError(400, 'userId must be a valid id.', [
      { field: 'userId', message: 'Invalid user id.' },
    ]);
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(400, 'Referenced user does not exist.', [
      { field: 'userId', message: 'User does not exist.' },
    ]);
  }

  if (!user.isActive) {
    throw new ApiError(400, 'Cannot link an inactive user.', [
      { field: 'userId', message: 'User is inactive.' },
    ]);
  }

  const linkQuery = { userId };
  if (excludePersonnelId) linkQuery._id = { $ne: excludePersonnelId };
  const existingLink = await Personnel.findOne(linkQuery);

  if (existingLink) {
    throw new ApiError(409, 'This user is already linked to another personnel record.');
  }

  const userDepartmentId = user.departmentId ? user.departmentId.toString() : null;

  if (user.role !== 'super_admin' && userDepartmentId !== departmentId.toString()) {
    throw new ApiError(
      409,
      'The linked user must belong to the same department as the personnel record (unless Super Admin).',
    );
  }

  return user;
}

export async function createPersonnel(payload) {
  const {
    employeeNumber,
    firstName,
    middleName = '',
    lastName,
    suffix = '',
    email,
    contactNumber = '',
    position,
    departmentId,
    userId = null,
    isActive = true,
  } = payload;

  await assertDepartmentIsUsable(departmentId);
  await assertNoDuplicatePersonnel({ employeeNumber, email });

  if (userId) {
    await assertLinkableUser(userId, departmentId);
  }

  const personnel = await Personnel.create({
    employeeNumber: employeeNumber.trim().toUpperCase(),
    firstName: firstName.trim(),
    middleName,
    lastName: lastName.trim(),
    suffix,
    email: email.trim().toLowerCase(),
    contactNumber,
    position: position.trim(),
    departmentId,
    // Omit the key entirely when unlinked — see the model's userId
    // comment on why an explicit `null` would break the sparse index.
    ...(userId ? { userId } : {}),
    isActive,
  });

  return personnel;
}

export async function updatePersonnel(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Personnel record not found.');
  }

  const personnel = await Personnel.findById(id);

  if (!personnel) {
    throw new ApiError(404, 'Personnel record not found.');
  }

  await assertNoDuplicatePersonnel(
    { employeeNumber: updates.employeeNumber, email: updates.email },
    personnel._id,
  );

  if (updates.departmentId !== undefined) {
    await assertDepartmentIsUsable(updates.departmentId);
  }

  const targetDepartmentId = updates.departmentId ?? personnel.departmentId.toString();
  const isChangingUserId = Object.prototype.hasOwnProperty.call(updates, 'userId');
  const resultingUserId = isChangingUserId
    ? updates.userId
    : personnel.userId
      ? personnel.userId.toString()
      : null;

  // Re-validate the link whenever it's being newly set/changed, or when
  // the department is changing and an existing link must stay
  // compatible with the new department (see docs/API_CONTRACT.md).
  if (resultingUserId && (isChangingUserId || updates.departmentId !== undefined)) {
    await assertLinkableUser(resultingUserId, targetDepartmentId, personnel._id);
  }

  if (updates.employeeNumber !== undefined) {
    personnel.employeeNumber = updates.employeeNumber.trim().toUpperCase();
  }
  if (updates.firstName !== undefined) personnel.firstName = updates.firstName.trim();
  if (updates.middleName !== undefined) personnel.middleName = updates.middleName;
  if (updates.lastName !== undefined) personnel.lastName = updates.lastName.trim();
  if (updates.suffix !== undefined) personnel.suffix = updates.suffix;
  if (updates.email !== undefined) personnel.email = updates.email.trim().toLowerCase();
  if (updates.contactNumber !== undefined) personnel.contactNumber = updates.contactNumber;
  if (updates.position !== undefined) personnel.position = updates.position.trim();
  if (updates.departmentId !== undefined) personnel.departmentId = updates.departmentId;
  if (isChangingUserId) {
    // Assigning `undefined` (not `null`) so a save with no link removes
    // the key entirely — see the model's userId comment on why an
    // explicit `null` would break the sparse unique index once more
    // than one record is unlinked.
    personnel.userId = updates.userId || undefined;
  }
  if (updates.isActive !== undefined) personnel.isActive = updates.isActive;

  await personnel.save();

  return personnel;
}

/**
 * Minimal, restricted "linkable users" view for the Personnel form —
 * deliberately not a general User Management API (see ADR-021).
 * Returns only fields safe to show a Super Admin picking a link
 * target: no passwordHash, no authProvider/googleSubjectId, no tokens.
 */
export async function listLinkableUsers() {
  const [users, links] = await Promise.all([
    User.find().select('_id displayName email role departmentId isActive').sort({ displayName: 1 }),
    Personnel.find({ userId: { $ne: null } }).select('userId'),
  ]);

  const linkedUserIds = new Set(links.map((link) => link.userId.toString()));

  return users.map((user) => ({
    id: user._id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    isActive: user.isActive,
    isLinked: linkedUserIds.has(user._id.toString()),
  }));
}
