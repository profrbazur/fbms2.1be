import { successEnvelope, commonResponses } from '../components.js';

const organizationSettingsBody = {
  type: 'object',
  description: 'All fields optional (partial update); at least one required. Unknown fields are rejected.',
  properties: {
    universityName: { type: 'string' },
    address: { type: 'string' },
    contactNumber: { type: 'string' },
    email: { type: 'string', format: 'email' },
    contactPerson: { type: 'string' },
    primaryColor: { type: 'string', example: '#002E1F' },
    secondaryColor: { type: 'string', example: '#FFB81C' },
    logoUrl: { type: 'string' },
    mobileHeartbeatIntervalSeconds: { type: 'integer', minimum: 30 },
    mobileMinAppVersion: { type: 'string' },
  },
};

export const organizationPaths = {
  '/organization': {
    get: {
      tags: ['Organization'],
      summary: 'Get organization settings',
      description: 'Reads the same OrganizationSettings singleton as GET /settings (two route surfaces over one document).',
      operationId: 'getOrganizationSettings',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Organization settings retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { settings: { $ref: '#/components/schemas/OrganizationSettings' } } }, 'Organization settings retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    patch: {
      tags: ['Organization'],
      summary: 'Update organization settings',
      operationId: 'updateOrganizationSettings',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: organizationSettingsBody } } },
      responses: {
        200: {
          description: 'Organization settings updated successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { settings: { $ref: '#/components/schemas/OrganizationSettings' } } }, 'Organization settings updated successfully.'),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
};
