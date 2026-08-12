import { successEnvelope, commonResponses } from '../components.js';

/**
 * V2.11B — added to close a documentation gap: `/api/v2/mobile/*` (V2.4's
 * enhanced, intentionally breaking kiosk workflow — Staff PIN /
 * ServiceSession / attributed feedback) shipped with full test coverage
 * and a complete write-up in docs/MOBILE_API_HANDOFF.md, but was never
 * added to this OpenAPI spec. See docs/v2/V2_4_STAFF_PIN_SERVICE_SESSION.md,
 * V2_6_SERVICE_TYPES.md, V2_7_RESPONDENT_TYPE.md.
 *
 * Only the genuinely new v2-only operations are documented here.
 * GET /api/v2/mobile/{config,survey}, POST /api/v2/mobile/{heartbeat,sync}
 * reuse the identical v1 controller functions with an identical contract
 * (see paths/mobile.js) and are intentionally NOT duplicated as separate
 * operations — there is nothing v2-specific to document for them.
 *
 * Path KEYS here are the full absolute path (e.g. `/api/v2/mobile/feedback`),
 * not short resource-relative keys like every other path module uses —
 * paired with a path-item-level `servers` override of just `/` (origin
 * root) so the resolved URL is correct. This is deliberate, not
 * decorative: `openApiDocument.paths` is one flat merged object across
 * every module, and a short key here would collide with an unrelated
 * /api/v1 resource of the same short name — `/feedback` would silently
 * overwrite feedback.js's admin `GET /api/v1/feedback`, and
 * `/service-types` would overwrite serviceTypes.js's admin
 * `GET/POST /api/v1/service-types` (both discovered failing this way
 * during V2.11B — object spread silently drops the earlier duplicate
 * key, which broke openapiDocument.test.js's key-count check and
 * routeInventory.test.js's coverage check). `/staff/*` and
 * `/respondent-types` have no such collision but use the same full-path
 * convention here for consistency within this one module.
 */
const originRootServer = [{ url: '/', description: 'Origin root — this path already spells out the full /api/v2/mobile prefix (see this module’s header comment for why).' }];

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

export const mobileV2Paths = {
  '/api/v2/mobile/staff/login': {
    servers: originRootServer,
    post: {
      tags: ['Mobile API V2 (Staff PIN Kiosk)'],
      summary: 'Staff PIN login — starts a ServiceSession',
      description:
        'V2.4. Validates a 6-digit Staff PIN and opens a ServiceSession for the calling tablet — the entry point of the kiosk workflow. PIN candidates are always scoped to the authenticated tablet’s own department; a PIN belonging to a different department is rejected with the same generic 401 as a wrong PIN (no cross-department enumeration). One active ServiceSession per tablet at a time.',
      operationId: 'postStaffLoginV2',
      security: [{ deviceAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['pin'],
              properties: { pin: { type: 'string', pattern: '^\\d{6}$', example: '111001' } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'ServiceSession started successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    serviceSession: { $ref: '#/components/schemas/ServiceSession' },
                    personnel: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        fullName: { type: 'string', example: 'Miguel Santos' },
                        position: { type: 'string', example: 'Registrar Department Head' },
                      },
                    },
                  },
                },
                'Staff service session started successfully.',
              ),
            },
          },
        },
        400: commonResponses.ValidationError,
        401: {
          description: 'Missing/invalid Device credential, or a wrong/inactive/wrong-department PIN (identical generic message in every case — enumeration-safe).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'Invalid PIN.', errors: [] } } },
        },
        409: {
          description: 'The tablet already has an active ServiceSession (One Active Session Rule).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'This tablet already has an active service session.', errors: [] } } },
        },
      },
    },
  },
  '/api/v2/mobile/staff/logout': {
    servers: originRootServer,
    post: {
      tags: ['Mobile API V2 (Staff PIN Kiosk)'],
      summary: 'Staff logout — ends the active ServiceSession',
      description: 'V2.4. Ends the calling tablet’s currently active ServiceSession. Not idempotent — logging out twice in a row returns 404 on the second attempt, not a harmless no-op.',
      operationId: 'postStaffLogoutV2',
      security: [{ deviceAuth: [] }],
      responses: {
        200: {
          description: 'ServiceSession ended successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceSession: { $ref: '#/components/schemas/ServiceSession' } } }, 'Staff service session ended successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        404: {
          description: 'The tablet has no active ServiceSession.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'No active service session found for this tablet.', errors: [] } } },
        },
      },
    },
  },
  '/api/v2/mobile/staff/active': {
    servers: originRootServer,
    get: {
      tags: ['Mobile API V2 (Staff PIN Kiosk)'],
      summary: 'Get the tablet’s current ServiceSession (or null)',
      description: 'V2.4. Lets a reconnecting/restarted kiosk client resync to the backend’s authoritative ServiceSession state instead of trusting stale local state. `serviceSession: null` is a normal, expected idle state, never an error.',
      operationId: 'getStaffActiveV2',
      security: [{ deviceAuth: [] }],
      responses: {
        200: {
          description: 'Active service session retrieved successfully (possibly null).',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceSession: { nullable: true, allOf: [{ $ref: '#/components/schemas/ServiceSession' }] } } }, 'Active service session retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/api/v2/mobile/service-types': {
    servers: originRootServer,
    get: {
      tags: ['Mobile API V2 (Staff PIN Kiosk)'],
      summary: 'List active service types for the tablet’s own department',
      description: 'V2.6. Lets the kiosk client populate a Service Type picker with exactly the submitting tablet’s own department’s active options — department-scoped, unlike GET /respondent-types below. Does not touch the admin-only, role-scoped GET /api/v1/service-types.',
      operationId: 'getServiceTypesV2',
      security: [{ deviceAuth: [] }],
      responses: {
        200: {
          description: 'Service types retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { serviceTypes: { type: 'array', items: { $ref: '#/components/schemas/ServiceType' } } } }, 'Service types retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/api/v2/mobile/respondent-types': {
    servers: originRootServer,
    get: {
      tags: ['Mobile API V2 (Staff PIN Kiosk)'],
      summary: 'List the fixed Respondent Type options',
      description: 'V2.7. A fixed, non-department-scoped list — every tablet sees the identical three values, since Respondent Type is a static system classification with no admin CRUD or database entity behind it.',
      operationId: 'getRespondentTypesV2',
      security: [{ deviceAuth: [] }],
      responses: {
        200: {
          description: 'Respondent types retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                {
                  type: 'object',
                  properties: {
                    respondentTypes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { value: { type: 'string', enum: ['student', 'employee', 'visitor'] }, label: { type: 'string', example: 'Student' } },
                      },
                      example: [
                        { value: 'student', label: 'Student' },
                        { value: 'employee', label: 'Employee' },
                        { value: 'visitor', label: 'Visitor' },
                      ],
                    },
                  },
                },
                'Respondent types retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
  },
  '/api/v2/mobile/feedback': {
    servers: originRootServer,
    post: {
      tags: ['Mobile API V2 (Staff PIN Kiosk)'],
      summary: 'Submit feedback with staff/service-type attribution',
      description:
        'V2.4/V2.6/V2.7. Identical base contract to POST /api/v1/mobile/feedback (see that entry), requiring the tablet to have a currently active ServiceSession — the entire point of the kiosk workflow. departmentId/locationId/personnelId/serviceSessionId/buildingId are always derived server-side, never accepted from the request body (a client-supplied attribution field is rejected as an unknown field, not silently ignored). Additionally requires serviceTypeId (independently re-verified server-side to belong to the submitting tablet’s own department) and accepts an optional respondentType.',
      operationId: 'submitFeedbackV2',
      security: [{ deviceAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['surveyId', 'submittedAt', 'completedAt', 'answers', 'serviceTypeId'],
              properties: {
                surveyId: { type: 'string' },
                submittedAt: { type: 'string', format: 'date-time' },
                completedAt: { type: 'string', format: 'date-time' },
                answers: { type: 'array', minItems: 1, items: answerSchema },
                serviceTypeId: { type: 'string', description: 'V2.6 — required. Must belong to the submitting tablet’s own department.' },
                respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'], nullable: true, description: 'V2.7 — optional, never required.' },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Feedback submitted successfully, attributed to the currently active ServiceSession.',
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
        409: {
          description: 'The submitted surveyId is not the tablet’s currently-active survey, or the tablet has no currently active ServiceSession (a staff member must log in first).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, message: 'No active service session. A staff member must log in first.', errors: [] } } },
        },
      },
    },
  },
};
