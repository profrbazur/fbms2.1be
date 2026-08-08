import { successEnvelope, commonResponses } from '../components.js';

const answerSchema = {
  type: 'object',
  required: ['questionId', 'answer'],
  properties: {
    questionId: { type: 'string' },
    answer: {
      description: 'Shape depends on the question’s type: rating=integer 1-5, yes_no=boolean, multiple_choice/short_text/long_text=string.',
      oneOf: [{ type: 'integer' }, { type: 'boolean' }, { type: 'string' }],
      example: 5,
    },
  },
};

export const mobilePaths = {
  '/mobile/activate': {
    post: {
      tags: ['Mobile API'],
      summary: 'Activate a tablet (exchange Activation Token for a Device Secret)',
      description:
        'Step 1 of the device authentication flow: Activation Token → Device Activation → Device Secret → Authenticated Mobile Requests. An admin registers a tablet (POST /api/v1/tablets), which generates a plaintext, single-use activationToken. The Android app submits that token here in exchange for a permanent Device Secret, returned exactly once in this response — the server stores only a SHA-256 hash of it (never the plaintext). Store the returned deviceSecret securely on-device (Android Keystore) and send it as `Authorization: Device <deviceSecret>` on every subsequent /api/v1/mobile/* request. A lost secret requires an admin to call POST /api/v1/tablets/{id}/regenerate-token to issue a fresh Activation Token. Deliberately returns the identical generic message for "no such token" and "already-used token" to prevent activation-token enumeration.',
      operationId: 'activateTablet',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['activationToken'],
              properties: { activationToken: { type: 'string', example: 'TAB-4F92A1C7' } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Tablet activated successfully. The deviceSecret is shown exactly once — it cannot be retrieved again.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    deviceSecret: { type: 'string', example: 'dvc_8f3a1c2e9b7d4f6a0e1c2b3a4d5e6f70' },
                    tablet: {
                      type: 'object',
                      properties: { deviceCode: { type: 'string', example: 'REG-T1' }, deviceName: { type: 'string', example: 'Registrar Kiosk 1' } },
                    },
                  },
                },
                'Tablet activated successfully. Store this Device Secret securely — it will not be shown again.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: {
          description: 'Invalid or already-used activation token (deliberately generic to prevent enumeration).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'Invalid or already-used activation token.', errors: [] } } },
        },
        403: {
          description: 'The token is valid but the tablet has been deactivated.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'This tablet has been deactivated. Contact an administrator.', errors: [] } } },
        },
      },
    },
  },
  '/mobile/heartbeat': {
    post: {
      tags: ['Mobile API'],
      summary: 'Send a device heartbeat',
      description: 'Updates lastSeen (used to derive Live Monitoring’s Online/Offline status) and optionally appVersion/androidVersion. No other tablet field is reachable through this endpoint.',
      operationId: 'postHeartbeat',
      security: [{ deviceAuth: [] }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { appVersion: { type: 'string', example: '1.0.0' }, androidVersion: { type: 'string', example: '14' } } },
          },
        },
      },
      responses: {
        200: {
          description: 'Heartbeat recorded successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { lastSeen: { type: 'string', format: 'date-time' }, appVersion: { type: 'string' }, androidVersion: { type: 'string' } } },
                'Heartbeat recorded successfully.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: {
          description: 'Missing/invalid Device Secret, or the tablet is inactive.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'Invalid or inactive device credential.', errors: [] } } },
        },
      },
    },
  },
  '/mobile/config': {
    get: {
      tags: ['Mobile API'],
      summary: 'Get kiosk display/operational configuration',
      description: 'Only the fields the Android client actually needs — no institutional contact info, no internal ids or counts.',
      operationId: 'getMobileConfig',
      security: [{ deviceAuth: [] }],
      responses: {
        200: {
          description: 'Mobile configuration retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { config: { $ref: '#/components/schemas/MobileConfig' } } }, 'Mobile configuration retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/mobile/survey': {
    get: {
      tags: ['Mobile API'],
      summary: 'Get the tablet’s currently active survey',
      description: 'Resolves via Location → Department → Global precedence. Only ever returns a published, non-archived survey.',
      operationId: 'getActiveSurveyForTablet',
      security: [{ deviceAuth: [] }],
      responses: {
        200: {
          description: 'Active survey retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' }, questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } } } },
                'Active survey retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
        404: {
          description: 'No published, non-archived survey resolves for this tablet’s location/department.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'No active survey is available for this tablet.', errors: [] } } },
        },
      },
    },
  },
  '/mobile/feedback': {
    post: {
      tags: ['Mobile API'],
      summary: 'Submit a completed feedback session',
      description: 'departmentId/locationId are always derived from the authenticated tablet, never accepted from the client. The active survey is re-resolved at submission time to reject a stale/cached survey the tablet no longer has active.',
      operationId: 'submitFeedback',
      security: [{ deviceAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['surveyId', 'submittedAt', 'completedAt', 'answers'],
              properties: {
                surveyId: { type: 'string' },
                submittedAt: { type: 'string', format: 'date-time' },
                completedAt: { type: 'string', format: 'date-time' },
                answers: { type: 'array', minItems: 1, items: answerSchema },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Feedback submitted successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    feedbackSession: { $ref: '#/components/schemas/FeedbackSession' },
                    answers: { type: 'array', items: { $ref: '#/components/schemas/FeedbackAnswer' } },
                    referenceCode: { type: 'string', example: 'FB-2026-003011' },
                  },
                },
                'Feedback submitted successfully.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/mobile/sync': {
    post: {
      tags: ['Mobile API'],
      summary: 'Acknowledge an offline sync attempt (Version 1 placeholder)',
      description: 'Version 1 implements only this stub contract — pendingFeedback, if supplied, must be an array, but its contents are not yet processed (no offline queue reconciliation in this version).',
      operationId: 'postSync',
      security: [{ deviceAuth: [] }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { pendingFeedback: { type: 'array', items: { type: 'object' } } } },
          },
        },
      },
      responses: {
        200: {
          description: 'Sync acknowledged.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { processed: { type: 'integer', example: 0 }, syncedAt: { type: 'string', format: 'date-time' } } },
                'Sync acknowledged. Offline synchronization is not yet implemented.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
      },
    },
  },
};
