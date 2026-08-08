import { successEnvelope, commonResponses } from '../components.js';

const settingsWriteBody = {
  type: 'object',
  description: 'A superset of PATCH /organization’s fields plus Operational/General settings. logoUrl and mobileMinAppVersion are NOT accepted here (logo is upload-only via POST /settings/logo; mobileMinAppVersion remains /organization-only). Partial update — at least one field required.',
  properties: {
    universityName: { type: 'string' },
    address: { type: 'string' },
    contactNumber: { type: 'string' },
    email: { type: 'string', format: 'email' },
    contactPerson: { type: 'string' },
    primaryColor: { type: 'string', example: '#002E1F' },
    secondaryColor: { type: 'string', example: '#FFB81C' },
    mobileHeartbeatIntervalSeconds: { type: 'integer', minimum: 30 },
    feedbackSessionTimeoutSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
    defaultTrendWindowDays: { type: 'integer', enum: [7, 30] },
    defaultPaginationSize: { type: 'integer', minimum: 1, maximum: 100 },
    timezone: { type: 'string', example: 'Asia/Manila', description: 'A valid IANA timezone identifier.' },
    dateFormat: { type: 'string', enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] },
    timeFormat: { type: 'string', enum: ['12h', '24h'] },
  },
};

export const settingsPaths = {
  '/settings': {
    get: {
      tags: ['Settings'],
      summary: 'Get settings',
      description: 'Reads the same OrganizationSettings singleton as GET /organization.',
      operationId: 'getSettings',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Settings retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { settings: { $ref: '#/components/schemas/OrganizationSettings' } } }, 'Settings retrieved successfully.') },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    patch: {
      tags: ['Settings'],
      summary: 'Update settings',
      description: 'Super Admin only.',
      operationId: 'updateSettings',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: settingsWriteBody } } },
      responses: {
        200: {
          description: 'Settings updated successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { settings: { $ref: '#/components/schemas/OrganizationSettings' } } }, 'Settings updated successfully.') },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/settings/logo': {
    post: {
      tags: ['Settings'],
      summary: 'Upload the organization logo',
      description: 'Super Admin only. multipart/form-data, field name "logo". PNG, JPEG, WEBP, or SVG only, 2MB maximum, exactly one file. Local disk storage in Version 1 — see docs/DEPLOYMENT.md for the Render ephemeral-storage limitation.',
      operationId: 'uploadSettingsLogo',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['logo'],
              properties: { logo: { type: 'string', format: 'binary' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Logo uploaded successfully.',
          content: {
            'application/json': { schema: successEnvelope({ type: 'object', properties: { settings: { $ref: '#/components/schemas/OrganizationSettings' } } }, 'Logo uploaded successfully.') },
          },
        },
        400: {
          description: 'Missing file, wrong type, or file exceeds the 2MB limit (all Multer failure modes are normalized to 400 by this endpoint).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'Logo must be a PNG, JPEG, WEBP, or SVG image.', errors: [] } } },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
};
