import { successEnvelope, commonResponses } from '../components.js';

export const authPaths = {
  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Log in with email and password',
      description: 'Version 1 uses seeded local accounts only (authProvider "local"). Returns a JWT to use as `Authorization: Bearer <token>` on subsequent requests.',
      operationId: 'login',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'admin@fbms.edu' },
                password: { type: 'string', format: 'password', example: 'ChangeMe123!' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Login successful.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
                'Login successful.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: {
          description: 'Invalid credentials or a deactivated account.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Invalid email or password.', errors: [] },
            },
          },
        },
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Authentication'],
      summary: 'Get the current authenticated user',
      operationId: 'getCurrentUser',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Current user retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }, 'Current user retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Authentication'],
      summary: 'Log out',
      description: 'Version 1 has no server-side session to revoke — the client simply discards its JWT. This endpoint does not require authentication so a client with an already-expired token can still call it; if a valid Bearer token is present, the logout is recorded in the audit log on a best-effort basis.',
      operationId: 'logout',
      security: [],
      responses: {
        200: {
          description: 'Logged out successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object' }, 'Logged out successfully.'),
            },
          },
        },
      },
    },
  },
};
