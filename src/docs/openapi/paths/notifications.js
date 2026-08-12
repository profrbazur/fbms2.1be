import { successEnvelope, commonResponses } from '../components.js';

export const notificationsPaths = {
  '/notifications': {
    get: {
      tags: ['Notifications'],
      summary: 'Get current derived notifications',
      description: 'V2.10 — strictly read-only, derived on every request from existing Live Monitoring/V2.8 Satisfaction KPI/V2.9 low-rating-pattern logic. No Notification collection — nothing is persisted, and there is no read/unread endpoint. Covers exactly three categories: device_offline, satisfaction_below_target, repeated_low_rating. Personnel never receive satisfaction_below_target or repeated_low_rating (aggregate department/office-level signals only, never targeted at an individual); device_offline for Personnel/Department Head is scoped to their own department, matching Live Monitoring\'s own established scoping.',
      operationId: 'getNotifications',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Notifications retrieved successfully.',
          content: {
            'application/json': { schema: successEnvelope({ $ref: '#/components/schemas/NotificationsResponse' }, 'Notifications retrieved successfully.') },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
};
