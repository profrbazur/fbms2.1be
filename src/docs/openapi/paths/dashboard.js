import { successEnvelope, commonResponses } from '../components.js';

export const dashboardPaths = {
  '/dashboard/summary': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get the role-scoped dashboard summary',
      description: 'Department Head/Personnel are always scoped to their own department server-side; Super Admin sees system-wide data.',
      operationId: 'getDashboardSummary',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'days', in: 'query', description: 'Feedback trend window in days (7 or 30). Falls back to the configured default.', schema: { type: 'integer', enum: [7, 30] } },
      ],
      responses: {
        200: {
          description: 'Dashboard summary retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ $ref: '#/components/schemas/DashboardSummary' }, 'Dashboard summary retrieved successfully.') },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
};
