import { successEnvelope, commonResponses, parameters } from '../components.js';

const locationWriteBody = (required) => ({
  type: 'object',
  required,
  properties: {
    name: { type: 'string', example: 'Registrar Front Desk' },
    code: { type: 'string', example: 'REG-FD', description: '2-20 letters, numbers, hyphens, or underscores.' },
    description: { type: 'string' },
    departmentId: { type: 'string' },
    buildingId: { type: 'string' },
    isActive: { type: 'boolean' },
  },
});

export const locationsPaths = {
  '/locations': {
    get: {
      tags: ['Locations'],
      summary: 'List locations',
      operationId: 'listLocations',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        parameters.buildingIdFilter,
        parameters.isActiveFilter,
        parameters.search,
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Locations retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    locations: { type: 'array', items: { $ref: '#/components/schemas/Location' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
                'Locations retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Locations'],
      summary: 'Create a location',
      description: 'Super Admin only.',
      operationId: 'createLocation',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: locationWriteBody(['name', 'code', 'departmentId', 'buildingId']) } } },
      responses: {
        201: {
          description: 'Location created successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { location: { $ref: '#/components/schemas/Location' } } }, 'Location created successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/locations/{id}': {
    get: {
      tags: ['Locations'],
      summary: 'Get a location by id',
      operationId: 'getLocation',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Location retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { location: { $ref: '#/components/schemas/Location' } } }, 'Location retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Locations'],
      summary: 'Update a location',
      description: 'Super Admin only. Partial update — at least one field required.',
      operationId: 'updateLocation',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: locationWriteBody([]) } } },
      responses: {
        200: {
          description: 'Location updated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { location: { $ref: '#/components/schemas/Location' } } }, 'Location updated successfully.'),
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
