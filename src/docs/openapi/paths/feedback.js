import { successEnvelope, commonResponses, parameters } from '../components.js';

export const feedbackPaths = {
  '/feedback': {
    get: {
      tags: ['Feedback'],
      summary: 'List feedback sessions',
      description: 'Strictly read-only — no write endpoint exists anywhere in this module. Anonymous (no respondent identity is ever captured).',
      operationId: 'listFeedbackSessions',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        { name: 'locationId', in: 'query', schema: { type: 'string' } },
        { name: 'surveyId', in: 'query', schema: { type: 'string' } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        parameters.search,
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Feedback sessions retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    feedbackSessions: { type: 'array', items: { $ref: '#/components/schemas/FeedbackSession' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
                'Feedback sessions retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/feedback/{id}': {
    get: {
      tags: ['Feedback'],
      summary: 'Get a feedback session with its answers',
      operationId: 'getFeedbackDetail',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Feedback session retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    feedbackSession: { $ref: '#/components/schemas/FeedbackSession' },
                    answers: { type: 'array', items: { $ref: '#/components/schemas/FeedbackAnswer' } },
                  },
                },
                'Feedback session retrieved successfully.',
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
