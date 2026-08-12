export const systemPaths = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Health check',
      description: 'Unauthenticated liveness/readiness check. Does not use the standard success envelope — see HealthResponse. V2.11 — also reports live MongoDB connection state, not just process liveness.',
      operationId: 'getHealth',
      security: [],
      responses: {
        200: {
          description: 'API process is up and the database connection is ready.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } },
          },
        },
        503: {
          description: 'V2.11 — API process is up, but the database connection is not ready (mongoose.connection.readyState !== 1).',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthResponse' },
              example: { success: false, message: 'FBMS API is running but the database is unreachable.', version: '1.0.0' },
            },
          },
        },
      },
    },
  },
};
