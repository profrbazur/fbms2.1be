import { successEnvelope, commonResponses, parameters } from '../components.js';

// Mounted at /api/v1/service-sessions (V2.4). Read-only for every admin
// role — mutation belongs exclusively to /api/v2/mobile/staff/* (Staff
// PIN login/logout), which is device-authenticated, not staff-JWT.
export const serviceSessionsPaths = {
  '/service-sessions': {
    get: {
      tags: ['Service Sessions'],
      summary: 'List service sessions',
      description: 'V2.4. Department Head/Personnel are always scoped to their own department. Read-only — see /api/v2/mobile/staff/* for the actual PIN login/logout lifecycle.',
      operationId: 'listServiceSessions',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        { name: 'tabletId', in: 'query', schema: { type: 'string' } },
        { name: 'personnelId', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'ended'] } },
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Service sessions retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    serviceSessions: { type: 'array', items: { $ref: '#/components/schemas/ServiceSession' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
                'Service sessions retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/service-sessions/{id}': {
    get: {
      tags: ['Service Sessions'],
      summary: 'Get a service session by id',
      operationId: 'getServiceSession',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Service session retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceSession: { $ref: '#/components/schemas/ServiceSession' } } }, 'Service session retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
};
