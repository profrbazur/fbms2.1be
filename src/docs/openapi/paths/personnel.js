import { successEnvelope, commonResponses, parameters } from '../components.js';

const personnelWriteBody = (required) => ({
  type: 'object',
  required,
  properties: {
    employeeNumber: { type: 'string', example: 'EMP-0007', description: '2-20 letters, numbers, hyphens, or underscores.' },
    firstName: { type: 'string', example: 'Maria' },
    middleName: { type: 'string' },
    lastName: { type: 'string', example: 'Cruz' },
    suffix: { type: 'string' },
    email: { type: 'string', format: 'email', example: 'mcruz@fbms.edu' },
    contactNumber: { type: 'string', example: '+63 917 000 0000' },
    position: { type: 'string', example: 'Registrar Personnel' },
    departmentId: { type: 'string' },
    userId: { type: 'string', nullable: true, description: 'Optional link/unlink to an existing User login account.' },
    isActive: { type: 'boolean' },
  },
});

export const personnelPaths = {
  '/personnel/linkable-users': {
    get: {
      tags: ['Personnel'],
      summary: 'List users eligible to be linked to a Personnel record',
      description: 'Super Admin only. Registered before /personnel/{id} to avoid Express matching "linkable-users" as an id.',
      operationId: 'getLinkableUsers',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Linkable users retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { users: { type: 'array', items: { $ref: '#/components/schemas/User' } } } }, 'Linkable users retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/personnel': {
    get: {
      tags: ['Personnel'],
      summary: 'List personnel records',
      operationId: 'listPersonnel',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        parameters.isActiveFilter,
        parameters.search,
        parameters.page,
        parameters.limit,
        { name: 'sortBy', in: 'query', schema: { type: 'string' }, description: 'Whitelisted sortable field (e.g. lastName, employeeNumber).' },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
      ],
      responses: {
        200: {
          description: 'Personnel retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    personnel: { type: 'array', items: { $ref: '#/components/schemas/Personnel' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
                'Personnel retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Personnel'],
      summary: 'Create a personnel record',
      description: 'Super Admin only. Personnel is an organizational record, deliberately separate from User login accounts.',
      operationId: 'createPersonnel',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: personnelWriteBody(['employeeNumber', 'firstName', 'lastName', 'email', 'position', 'departmentId']) } },
      },
      responses: {
        201: {
          description: 'Personnel record created successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { personnel: { $ref: '#/components/schemas/Personnel' } } }, 'Personnel record created successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/personnel/{id}': {
    get: {
      tags: ['Personnel'],
      summary: 'Get a personnel record by id',
      operationId: 'getPersonnel',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Personnel record retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { personnel: { $ref: '#/components/schemas/Personnel' } } }, 'Personnel record retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Personnel'],
      summary: 'Update a personnel record',
      description: 'Super Admin only. Partial update — at least one field required. Can toggle isActive and/or link/unlink userId in the same request.',
      operationId: 'updatePersonnel',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: personnelWriteBody([]) } } },
      responses: {
        200: {
          description: 'Personnel record updated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { personnel: { $ref: '#/components/schemas/Personnel' } } }, 'Personnel record updated successfully.'),
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
  '/personnel/{id}/regenerate-pin': {
    post: {
      tags: ['Personnel'],
      summary: 'Regenerate a personnel member’s Staff PIN',
      description: 'V2.4, Super Admin only. Issues a fresh, server-generated 6-digit Staff PIN and returns it in plaintext exactly once — it is never retrievable again afterward, and pinHash is never exposed by any endpoint. The old PIN, if any, is immediately invalidated.',
      operationId: 'regeneratePersonnelPin',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Staff PIN regenerated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    pin: { type: 'string', example: '048213', description: 'Plaintext PIN — shown only in this one response.' },
                    personnel: { $ref: '#/components/schemas/Personnel' },
                  },
                },
                'Staff PIN regenerated successfully.',
              ),
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
