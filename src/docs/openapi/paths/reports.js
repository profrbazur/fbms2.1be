import { successEnvelope, commonResponses, parameters } from '../components.js';

export const reportsPaths = {
  '/reports/feedback-summary': {
    get: {
      tags: ['Reports'],
      summary: 'Get the consolidated feedback report',
      description: 'One consolidated, strictly read-only report (summary cards, trend, rating distribution, department/survey/location breakdowns, survey performance, tablet contribution) rather than several separate endpoints. Department Head/Personnel are always pinned to their own department server-side.',
      operationId: 'getFeedbackSummaryReport',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        { name: 'locationId', in: 'query', schema: { type: 'string' } },
        { name: 'surveyId', in: 'query', schema: { type: 'string' } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'trendDays', in: 'query', description: 'Feedback trend window in days (7 or 30) when dateFrom/dateTo are not both supplied.', schema: { type: 'integer', enum: [7, 30] } },
      ],
      responses: {
        200: {
          description: 'Feedback summary report retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ $ref: '#/components/schemas/ReportsSummary' }, 'Feedback summary report retrieved successfully.') },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
      },
    },
  },
};
