import Tablet from '../models/Tablet.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidObjectId } from '../utils/isValidObjectId.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { generateActivationToken } from '../utils/generateActivationToken.js';
import { parsePositiveInt } from '../utils/parsePositiveInt.js';
import { isGlobalReadRole } from '../utils/roleScope.js';
import { assertLocationIsUsable } from './locationService.js';

const MAX_TOKEN_GENERATION_ATTEMPTS = 5;

async function assertNoDuplicateDeviceCode(deviceCode, excludeId) {
  const normalizedCode = deviceCode.trim().toUpperCase();
  const query = { deviceCode: normalizedCode };
  if (excludeId) query._id = { $ne: excludeId };

  const duplicate = await Tablet.findOne(query);
  if (duplicate) {
    throw new ApiError(409, 'A tablet with that device code already exists.');
  }
}

/**
 * Generates a unique TAB-XXXXXXXX token, retrying on the (astronomically
 * unlikely) chance of a collision against the unique index rather than
 * trusting randomness alone.
 */
async function generateUniqueActivationToken() {
  for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateActivationToken();
    const existing = await Tablet.findOne({ activationToken: candidate });
    if (!existing) return candidate;
  }

  throw new ApiError(500, 'Unable to generate a unique activation token. Please try again.');
}

/**
 * Department Head/Personnel are always pinned to their own department,
 * regardless of what departmentId the client supplied — per
 * docs/ARCHITECTURE.md's "never trust a client-provided department"
 * principle, the same pattern applied to Locations/Personnel.
 */
export async function listTablets(
  user,
  { departmentId, locationId, isActive, search, page = 1, limit = 20 } = {},
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
      return { tablets: [], pagination: { page: 1, limit: parsePositiveInt(limit, 20), total: 0, pages: 0 } };
    }
    filter.departmentId = user.departmentId;
  }

  if (locationId) {
    if (!isValidObjectId(locationId)) {
      throw new ApiError(400, 'locationId must be a valid id.', [
        { field: 'locationId', message: 'Invalid location id.' },
      ]);
    }
    filter.locationId = locationId;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$or = [{ deviceName: regex }, { deviceCode: regex }, { serialNumber: regex }];
  }

  const pageNum = parsePositiveInt(page, 1);
  const limitNum = Math.min(100, parsePositiveInt(limit, 20));
  const skip = (pageNum - 1) * limitNum;

  const [tablets, total] = await Promise.all([
    Tablet.find(filter).sort({ deviceName: 1 }).skip(skip).limit(limitNum),
    Tablet.countDocuments(filter),
  ]);

  return {
    tablets,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limitNum),
    },
  };
}

export async function getTabletById(user, id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Tablet not found.');
  }

  const tablet = await Tablet.findById(id);

  if (!tablet) {
    throw new ApiError(404, 'Tablet not found.');
  }

  if (!isGlobalReadRole(user.role)) {
    const ownDepartmentId = user.departmentId ? user.departmentId.toString() : null;
    if (ownDepartmentId !== tablet.departmentId.toString()) {
      throw new ApiError(403, 'You do not have access to this tablet.');
    }
  }

  return tablet;
}

export async function createTablet(payload) {
  const {
    deviceName,
    deviceCode,
    locationId,
    serialNumber = '',
    appVersion = '',
    androidVersion = '',
    notes = '',
    isActive = true,
  } = payload;

  const location = await assertLocationIsUsable(locationId);
  await assertNoDuplicateDeviceCode(deviceCode);

  const activationToken = await generateUniqueActivationToken();

  const tablet = await Tablet.create({
    deviceName: deviceName.trim(),
    deviceCode: deviceCode.trim().toUpperCase(),
    locationId,
    departmentId: location.departmentId,
    serialNumber,
    activationToken,
    appVersion,
    androidVersion,
    notes,
    isActive,
  });

  return tablet;
}

export async function updateTablet(id, updates) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Tablet not found.');
  }

  const tablet = await Tablet.findById(id);

  if (!tablet) {
    throw new ApiError(404, 'Tablet not found.');
  }

  if (updates.deviceCode !== undefined) {
    await assertNoDuplicateDeviceCode(updates.deviceCode, tablet._id);
    tablet.deviceCode = updates.deviceCode.trim().toUpperCase();
  }

  if (updates.locationId !== undefined) {
    const location = await assertLocationIsUsable(updates.locationId);
    tablet.locationId = updates.locationId;
    tablet.departmentId = location.departmentId;
  }

  if (updates.deviceName !== undefined) tablet.deviceName = updates.deviceName.trim();
  if (updates.serialNumber !== undefined) tablet.serialNumber = updates.serialNumber;
  if (updates.appVersion !== undefined) tablet.appVersion = updates.appVersion;
  if (updates.androidVersion !== undefined) tablet.androidVersion = updates.androidVersion;
  if (updates.notes !== undefined) tablet.notes = updates.notes;
  if (updates.isActive !== undefined) tablet.isActive = updates.isActive;

  await tablet.save();

  return tablet;
}

/**
 * Regenerating the activation token is a deliberate re-provisioning
 * action (lost/replaced tablet, suspected compromise) — so it also
 * revokes the tablet's current Device Secret and re-opens activation
 * (P5.1), not just the token value. Leaving a prior Device Secret valid
 * after issuing a "fresh" token would defeat the point of regenerating
 * it. See docs/MOBILE_PROTOCOL.md and docs/DECISIONS.md.
 */
export async function regenerateActivationToken(id) {
  if (!isValidObjectId(id)) {
    throw new ApiError(404, 'Tablet not found.');
  }

  const tablet = await Tablet.findById(id);

  if (!tablet) {
    throw new ApiError(404, 'Tablet not found.');
  }

  tablet.activationToken = await generateUniqueActivationToken();
  tablet.activationConsumedAt = null;
  // undefined (unset), not null — see the model's sparse-index comment.
  tablet.deviceSecretHash = undefined;
  await tablet.save();

  return tablet;
}
