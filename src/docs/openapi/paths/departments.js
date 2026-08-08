import { successEnvelope, commonResponses, parameters } from '../components.js';

const departmentWriteBody = (required) => ({
  type: 'object',
  required,
  properties: {
    name: { type: 'string', example: 'Registrar' },
    code: { type: 'string', example: 'REG', description: '2-20 letters, numbers, hyphens, or underscores.' },
    description: { type: 'string', example: 'Handles student records and enrollment.' },
    isActive: { type: 'boolean' },
  },
});

export const departmentsPaths = {
  '/departments': {
    get: {
      tags: ['Departments'],
      summary: 'List departments',
      operationId: 'listDepartments',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.isActiveFilter],
      responses: {
        200: {
          description: 'Departments retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { departments: { type: 'array', items: { $ref: '#/components/schemas/Department' } } } },
                'Departments retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Departments'],
      summary: 'Create a department',
      description: 'Super Admin only.',
      operationId: 'createDepartment',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: departmentWriteBody(['name', 'code']) } } },
      responses: {
        201: {
          description: 'Department created successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { department: { $ref: '#/components/schemas/Department' } } }, 'Department created successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/departments/{id}': {
    get: {
      tags: ['Departments'],
      summary: 'Get a department by id',
      operationId: 'getDepartment',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Department retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { department: { $ref: '#/components/schemas/Department' } } }, 'Department retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Departments'],
      summary: 'Update a department',
      description: 'Super Admin only. Partial update — at least one field required.',
      operationId: 'updateDepartment',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: departmentWriteBody([]) } } },
      responses: {
        200: {
          description: 'Department updated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { department: { $ref: '#/components/schemas/Department' } } }, 'Department updated successfully.'),
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
