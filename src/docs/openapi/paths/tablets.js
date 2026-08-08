import { successEnvelope, commonResponses, parameters } from '../components.js';

const tabletWriteBody = (required) => ({
  type: 'object',
  required,
  properties: {
    deviceName: { type: 'string', example: 'Registrar Kiosk 1' },
    deviceCode: { type: 'string', example: 'REG-T1', description: '2-20 letters, numbers, hyphens, or underscores.' },
    locationId: { type: 'string' },
    serialNumber: { type: 'string' },
    appVersion: { type: 'string' },
    androidVersion: { type: 'string' },
    notes: { type: 'string' },
    isActive: { type: 'boolean' },
  },
  description: 'departmentId, activationToken, and lastSeen are server-derived/generated only — never accepted here.',
});

export const tabletsPaths = {
  '/tablets': {
    get: {
      tags: ['Tablets'],
      summary: 'List tablets',
      operationId: 'listTablets',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        { name: 'locationId', in: 'query', schema: { type: 'string' } },
        parameters.isActiveFilter,
        parameters.search,
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Tablets retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { tablets: { type: 'array', items: { $ref: '#/components/schemas/Tablet' } }, pagination: { $ref: '#/components/schemas/Pagination' } } },
                'Tablets retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Tablets'],
      summary: 'Register a tablet',
      description: 'Super Admin only. departmentId is always derived server-side from locationId.',
      operationId: 'createTablet',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: tabletWriteBody(['deviceName', 'deviceCode', 'locationId']) } } },
      responses: {
        201: {
          description: 'Tablet created successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { tablet: { $ref: '#/components/schemas/Tablet' } } }, 'Tablet created successfully.') },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/tablets/{id}': {
    get: {
      tags: ['Tablets'],
      summary: 'Get a tablet by id',
      operationId: 'getTablet',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Tablet retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { tablet: { $ref: '#/components/schemas/Tablet' } } }, 'Tablet retrieved successfully.') },
          },
        },
        401: commonResponses.Unauthorized,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Tablets'],
      summary: 'Update a tablet',
      description: 'Super Admin only. Partial update — at least one field required.',
      operationId: 'updateTablet',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: tabletWriteBody([]) } } },
      responses: {
        200: {
          description: 'Tablet updated successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { tablet: { $ref: '#/components/schemas/Tablet' } } }, 'Tablet updated successfully.') },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
  '/tablets/{id}/regenerate-token': {
    post: {
      tags: ['Tablets'],
      summary: 'Regenerate a tablet’s activation token',
      description: 'Super Admin only. Issues a fresh Activation Token and revokes the tablet’s current Device Secret in one step — required after a lost/compromised Device Secret. The old and new token values are never recorded in the audit log.',
      operationId: 'regenerateTabletToken',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Activation token regenerated successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { tablet: { $ref: '#/components/schemas/Tablet' } } }, 'Activation token regenerated successfully.') },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
};
