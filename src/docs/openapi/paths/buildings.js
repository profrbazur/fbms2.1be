import { successEnvelope, commonResponses, parameters } from '../components.js';

const buildingWriteBody = (required) => ({
  type: 'object',
  required,
  properties: {
    name: { type: 'string', example: 'Taft Campus' },
    code: { type: 'string', example: 'TAFT', description: '2-20 letters, numbers, hyphens, or underscores.' },
    description: { type: 'string', example: 'Main Taft Avenue campus.' },
    isActive: { type: 'boolean' },
  },
});

export const buildingsPaths = {
  '/buildings': {
    get: {
      tags: ['Buildings'],
      summary: 'List buildings',
      description:
        'Super Admin/Senior Leadership see every building (with an optional isActive filter). Department Head/Personnel always see active buildings only.',
      operationId: 'listBuildings',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.isActiveFilter, parameters.search],
      responses: {
        200: {
          description: 'Buildings retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { buildings: { type: 'array', items: { $ref: '#/components/schemas/Building' } } } },
                'Buildings retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Buildings'],
      summary: 'Create a building',
      description: 'Super Admin only.',
      operationId: 'createBuilding',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: buildingWriteBody(['name', 'code']) } } },
      responses: {
        201: {
          description: 'Building created successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { building: { $ref: '#/components/schemas/Building' } } }, 'Building created successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/buildings/{id}': {
    get: {
      tags: ['Buildings'],
      summary: 'Get a building by id',
      operationId: 'getBuilding',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Building retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { building: { $ref: '#/components/schemas/Building' } } }, 'Building retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Buildings'],
      summary: 'Update a building',
      description: 'Super Admin only. Partial update — at least one field required. Senior Leadership is read-only and cannot mutate.',
      operationId: 'updateBuilding',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: buildingWriteBody([]) } } },
      responses: {
        200: {
          description: 'Building updated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { building: { $ref: '#/components/schemas/Building' } } }, 'Building updated successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
};
