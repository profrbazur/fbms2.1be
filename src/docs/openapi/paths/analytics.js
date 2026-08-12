import { successEnvelope, commonResponses, parameters } from '../components.js';

export const analyticsPaths = {
  '/analytics/advanced': {
    get: {
      tags: ['Analytics'],
      summary: 'Get role-specific advanced analytics',
      description: 'V2.9 — one consolidated, strictly read-only endpoint whose response shape is role-tiered: Super Admin/Senior Leadership receive an institution-wide strategic view, Department Head their own Office\'s operational view, and Personnel their own individual attribution-based view. See the AdvancedAnalytics schema for the three shapes.',
      operationId: 'getAdvancedAnalytics',
      security: [{ bearerAuth: [] }],
      parameters: [
        { ...parameters.departmentIdFilter, description: 'Narrows an institution-wide (Super Admin/Senior Leadership) view to one Department. Ignored for Department Head/Personnel, who are always pinned to their own scope server-side.' },
        { name: 'buildingId', in: 'query', schema: { type: 'string' } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'trendDays', in: 'query', description: 'Trend/period-comparison window in days (7 or 30) when dateFrom/dateTo are not both supplied.', schema: { type: 'integer', enum: [7, 30] } },
      ],
      responses: {
        200: {
          description: 'Advanced analytics retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ $ref: '#/components/schemas/AdvancedAnalytics' }, 'Advanced analytics retrieved successfully.') },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
      },
    },
  },
};
