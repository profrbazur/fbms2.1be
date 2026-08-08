import { successEnvelope, commonResponses, parameters } from '../components.js';

export const auditLogsPaths = {
  '/audit-logs': {
    get: {
      tags: ['Audit Logs'],
      summary: 'List audit log entries',
      description: 'Super Admin only — a system-wide administrative/security feature, not department-scoped. Strictly read-only; no write endpoint exists anywhere in this module (append-only by omission).',
      operationId: 'listAuditLogs',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.search,
        { name: 'actorUserId', in: 'query', schema: { type: 'string' } },
        { name: 'action', in: 'query', schema: { type: 'string' }, description: 'One of AuditLog’s ~31 enumerated action values, e.g. tablet.regenerate_token.' },
        { name: 'entityType', in: 'query', schema: { type: 'string', enum: ['auth', 'settings', 'department', 'location', 'personnel', 'tablet', 'survey', 'question', 'developerPortal'] } },
        parameters.departmentIdFilter,
        { name: 'outcome', in: 'query', schema: { type: 'string', enum: ['success', 'failure'] } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Audit logs retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { auditLogs: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } }, pagination: { $ref: '#/components/schemas/Pagination' } } },
                'Audit logs retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/audit-logs/{id}': {
    get: {
      tags: ['Audit Logs'],
      summary: 'Get an audit log entry by id',
      description: 'Super Admin only.',
      operationId: 'getAuditLogDetail',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Audit log entry retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { auditLog: { $ref: '#/components/schemas/AuditLog' } } }, 'Audit log entry retrieved successfully.') },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
};
