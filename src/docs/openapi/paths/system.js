export const systemPaths = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Health check',
      description: 'Unauthenticated liveness check. Does not use the standard success envelope — see HealthResponse.',
      operationId: 'getHealth',
      security: [],
      responses: {
        200: {
          description: 'API is running.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } },
          },
        },
      },
    },
  },
};
