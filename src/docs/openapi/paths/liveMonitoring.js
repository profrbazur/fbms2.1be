import { successEnvelope, commonResponses, parameters } from '../components.js';

export const liveMonitoringPaths = {
  '/live-monitoring/summary': {
    get: {
      tags: ['Live Monitoring'],
      summary: 'Get the live monitoring summary',
      operationId: 'getLiveMonitoringSummary',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Live monitoring summary retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { summary: { $ref: '#/components/schemas/LiveMonitoringSummary' } } }, 'Live monitoring summary retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/live-monitoring/tablets': {
    get: {
      tags: ['Live Monitoring'],
      summary: 'List monitored tablets',
      description: 'Online/Offline/Inactive status is always derived from isActive/lastSeen, never stored. Never exposes activationToken.',
      operationId: 'listMonitoredTablets',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        { name: 'locationId', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['online', 'offline', 'inactive'] } },
        { name: 'surveyId', in: 'query', schema: { type: 'string' } },
        parameters.search,
        { name: 'dateFrom', in: 'query', description: 'Filters on lastSeen.', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', description: 'Filters on lastSeen.', schema: { type: 'string', format: 'date' } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['deviceName', 'deviceCode', 'lastSeen'], default: 'deviceName' } },
        { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Monitored tablets retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { tablets: { type: 'array', items: { $ref: '#/components/schemas/MonitoredTablet' } }, pagination: { $ref: '#/components/schemas/Pagination' } } },
                'Monitored tablets retrieved successfully.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/live-monitoring/tablets/{id}': {
    get: {
      tags: ['Live Monitoring'],
      summary: 'Get a monitored tablet’s detail',
      operationId: 'getMonitoredTabletDetail',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Tablet monitoring detail retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    tablet: { $ref: '#/components/schemas/MonitoredTablet' },
                    department: { type: 'object', nullable: true, properties: { _id: { type: 'string' }, name: { type: 'string' } } },
                  },
                },
                'Tablet monitoring detail retrieved successfully.',
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
