import { successEnvelope, commonResponses } from '../components.js';

export const developerPortalPaths = {
  '/developer-portal/reload-canonical-dataset': {
    post: {
      tags: ['Developer Portal'],
      summary: 'Reload the canonical demonstration dataset',
      description:
        'Super Admin only. Deletes any FeedbackSession/FeedbackAnswer outside the protected FB-2026-000001..003010 reference-code range and re-applies the canonical 3,000-session baseline. Useful for restoring a clean teaching/demo state after ad-hoc testing (e.g. real mobile-app submissions against a shared environment). Can take tens of seconds against a free-tier Atlas cluster — see docs/DEPLOYMENT.md.',
      operationId: 'reloadCanonicalDataset',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Canonical demonstration dataset reloaded successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    deletedSessions: { type: 'integer', example: 12 },
                    deletedAnswers: { type: 'integer', example: 41 },
                    restoredSessions: { type: 'integer', example: 3010 },
                    restoredAnswers: { type: 'integer', example: 10700 },
                  },
                },
                'Canonical demonstration dataset reloaded successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
};
