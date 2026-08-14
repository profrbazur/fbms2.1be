import { successEnvelope, commonResponses, parameters } from '../components.js';

const serviceTypeCreateBody = {
  type: 'object',
  required: ['name', 'code', 'departmentId'],
  properties: {
    name: { type: 'string', example: 'Enrollment / Registration' },
    code: { type: 'string', example: 'REG-SVC-01', description: '2-20 letters, numbers, hyphens, or underscores. Unique within its departmentId, not globally.' },
    description: { type: 'string' },
    departmentId: { type: 'string' },
    isActive: { type: 'boolean' },
    sortOrder: { type: 'integer' },
  },
};

const serviceTypeUpdateBody = {
  type: 'object',
  description: 'departmentId cannot be changed after creation.',
  properties: {
    name: { type: 'string' },
    code: { type: 'string' },
    description: { type: 'string' },
    isActive: { type: 'boolean' },
    sortOrder: { type: 'integer' },
  },
};

export const serviceTypesPaths = {
  '/service-types': {
    get: {
      tags: ['Service Types'],
      summary: 'List service types',
      description: 'Department Head/Personnel are always scoped to their own department, active-only, regardless of query parameters.',
      operationId: 'listServiceTypes',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        parameters.isActiveFilter,
        parameters.search,
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Service types retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    serviceTypes: { type: 'array', items: { $ref: '#/components/schemas/ServiceType' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
                'Service types retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Service Types'],
      summary: 'Create a service type',
      description: 'Super Admin only.',
      operationId: 'createServiceType',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: serviceTypeCreateBody } } },
      responses: {
        201: {
          description: 'Service type created successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceType: { $ref: '#/components/schemas/ServiceType' } } }, 'Service type created successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/service-types/{id}': {
    get: {
      tags: ['Service Types'],
      summary: 'Get a service type by id',
      operationId: 'getServiceType',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Service type retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceType: { $ref: '#/components/schemas/ServiceType' } } }, 'Service type retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Service Types'],
      summary: 'Update a service type',
      description: 'Super Admin only. Partial update — at least one field required.',
      operationId: 'updateServiceType',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: serviceTypeUpdateBody } } },
      responses: {
        200: {
          description: 'Service type updated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceType: { $ref: '#/components/schemas/ServiceType' } } }, 'Service type updated successfully.'),
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
