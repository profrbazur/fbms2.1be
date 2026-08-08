import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  listDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
} from '../services/departmentService.js';
import { recordAuditEvent, resolveLifecycleAction } from '../services/auditService.js';
import { parseBooleanQueryParam } from '../utils/parseBooleanQueryParam.js';

export const getDepartments = asyncHandler(async function getDepartments(req, res) {
  const { isActive } = req.query;

  const departments = await listDepartments(req.user, { isActive: parseBooleanQueryParam(isActive) });

  return sendSuccess(res, {
    message: 'Departments retrieved successfully.',
    data: { departments },
  });
});

export const getDepartment = asyncHandler(async function getDepartment(req, res) {
  const department = await getDepartmentById(req.user, req.params.id);

  return sendSuccess(res, {
    message: 'Department retrieved successfully.',
    data: { department },
  });
});

export const postDepartment = asyncHandler(async function postDepartment(req, res) {
  const department = await createDepartment(req.body);

  await recordAuditEvent({
    actor: req.user,
    action: 'department.create',
    entityType: 'department',
    entityId: department._id,
    entityLabel: department.name,
    departmentId: department._id,
    req,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Department created successfully.',
    data: { department },
  });
});

export const patchDepartment = asyncHandler(async function patchDepartment(req, res) {
  const previous = await getDepartmentById(req.user, req.params.id);
  const wasActive = previous.isActive;

  const department = await updateDepartment(req.params.id, req.body);

  await recordAuditEvent({
    actor: req.user,
    action: resolveLifecycleAction('department', wasActive, department.isActive),
    entityType: 'department',
    entityId: department._id,
    entityLabel: department.name,
    departmentId: department._id,
    metadata: { changedFields: Object.keys(req.body ?? {}) },
    req,
  });

  return sendSuccess(res, {
    message: 'Department updated successfully.',
    data: { department },
  });
});
