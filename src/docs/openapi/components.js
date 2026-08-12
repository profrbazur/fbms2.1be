/**
 * Reusable OpenAPI 3.0 components for the FBMS API — security schemes and
 * data schemas shared across every path module in ./paths/. Kept as plain
 * JS objects (not JSDoc-in-source annotations) so the spec stays in one
 * maintainable location instead of scattered across 20+ controller files.
 * See docs/DECISIONS.md ADR-053.
 *
 * Field lists here mirror the actual Mongoose schemas exactly (see
 * backend/src/models/) — sensitive fields (User.passwordHash,
 * Tablet.deviceSecretHash) are deliberately never included, matching what
 * the real API responses already strip (User's toJSON transform,
 * Mongoose's own `select: false`).
 */

export const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Staff/admin authentication. Obtain a token from `POST /api/v1/auth/login`, then send `Authorization: Bearer <token>` on every subsequent request. The token is re-verified against the live User record on every request — a deactivated account is rejected immediately even with a still-validly-signed token.',
  },
  deviceAuth: {
    type: 'apiKey',
    in: 'header',
    name: 'Authorization',
    description:
      'Mobile/tablet device authentication — a distinct scheme from staff JWT, never interchangeable (sending a JWT here, or a Device Secret to a staff endpoint, is always rejected). Obtain a Device Secret from `POST /api/v1/mobile/activate` (returned exactly once — store it securely). Enter the full header value, including the `Device ` prefix, e.g. `Device dvc_9f2c...`.',
  },
};

/**
 * Wraps a data schema in the project's standard success envelope
 * (docs/ARCHITECTURE.md): { success, message, data }. Used inline by path
 * modules rather than as a single generic $ref, since `data`'s shape is
 * different for every operation.
 */
export function successEnvelope(dataSchema, messageExample = 'Request completed successfully.') {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: messageExample },
      data: dataSchema,
    },
  };
}

export const errorResponseContent = {
  'application/json': {
    schema: { $ref: '#/components/schemas/ErrorResponse' },
  },
};

/** A standard `{ description, content }` response fragment for a given status/message. */
export function errorResponse(description, messageExample) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { success: false, message: messageExample, errors: [] },
      },
    },
  };
}

export const commonResponses = {
  Unauthorized: errorResponse(
    'Missing, invalid, or expired credentials.',
    'Authentication token is required.',
  ),
  Forbidden: errorResponse(
    'Authenticated but not permitted to access this resource (wrong role or department).',
    'You do not have access to this resource.',
  ),
  NotFound: errorResponse('No resource exists with the given id.', 'Resource not found.'),
  ValidationError: errorResponse('Request body or query failed validation.', 'Validation failed.'),
};

export const parameters = {
  page: {
    name: 'page',
    in: 'query',
    description: 'Page number (1-based).',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  limit: {
    name: 'limit',
    in: 'query',
    description: 'Items per page (capped at 100 server-side).',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  search: {
    name: 'search',
    in: 'query',
    description: 'Case-insensitive substring search over the resource’s primary text fields.',
    schema: { type: 'string' },
  },
  isActiveFilter: {
    name: 'isActive',
    in: 'query',
    description: 'Filter by active status.',
    schema: { type: 'boolean' },
  },
  departmentIdFilter: {
    name: 'departmentId',
    in: 'query',
    description:
      'Filter by department id. For Department Head/Personnel this is always overridden server-side to their own department; only Super Admin can use it to narrow the result set.',
    schema: { type: 'string' },
  },
  buildingIdFilter: {
    name: 'buildingId',
    in: 'query',
    description:
      'Filter locations by building id. Only meaningful for Super Admin/Senior Leadership (global read roles); ignored for Department Head/Personnel, who cannot use it to see outside their own department.',
    schema: { type: 'string' },
  },
  idParam: {
    name: 'id',
    in: 'path',
    required: true,
    description: 'MongoDB ObjectId of the resource.',
    schema: { type: 'string', example: '65f1c2a4b8e4a2a1d4e5f6a7' },
  },
};

const objectId = { type: 'string', example: '65f1c2a4b8e4a2a1d4e5f6a7' };
const timestamps = {
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};

/**
 * V2.8 — Satisfaction KPI Targets (backend/docs/v2/V2_8_KPI_TARGETS.md).
 * Identical shape shared by DashboardSummary.satisfactionKpi and
 * ReportsSummary.satisfactionKpi (see analyticsService.getSatisfactionKpi).
 */
const satisfactionKpi = {
  type: 'object',
  description: 'Target vs actual satisfaction on the same 1-5 rating scale as averageRating. target resolves a Department override -> the Organization default, always present. actual/variance are null and status is "no_data" only when there is no rating data in scope yet.',
  properties: {
    target: { type: 'number', nullable: true, example: 4.2 },
    actual: { type: 'number', nullable: true, example: 4.34 },
    variance: { type: 'number', nullable: true, example: 0.14, description: 'actual - target, rounded to 2 decimals.' },
    status: { type: 'string', enum: ['above_target', 'below_target', 'on_target', 'no_data'], example: 'above_target' },
    trend: {
      type: 'object',
      description: 'Current 7/30-day rolling-window average rating vs. the window immediately before it. direction is null when an explicit custom date range is selected, or when either window has no rating data.',
      properties: {
        direction: { type: 'string', nullable: true, enum: ['up', 'down', 'flat'], example: 'up' },
        previousActual: { type: 'number', nullable: true, example: 4.21 },
      },
    },
  },
};

export const schemas = {
  ValidationErrorItem: {
    type: 'object',
    properties: {
      field: { type: 'string', example: 'email' },
      message: { type: 'string', example: 'Email is required.' },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Validation failed.' },
      errors: {
        type: 'array',
        items: { $ref: '#/components/schemas/ValidationErrorItem' },
      },
    },
  },
  Pagination: {
    type: 'object',
    properties: {
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
      total: { type: 'integer', example: 57 },
      pages: { type: 'integer', example: 3 },
    },
  },

  User: {
    type: 'object',
    description: 'A staff account (never exposes passwordHash).',
    properties: {
      _id: objectId,
      email: { type: 'string', format: 'email', example: 'admin@fbms.edu' },
      displayName: { type: 'string', example: 'Alex Santos' },
      role: {
        type: 'string',
        enum: ['super_admin', 'department_head', 'personnel'],
        example: 'super_admin',
      },
      departmentId: { ...objectId, nullable: true },
      authProvider: { type: 'string', enum: ['local', 'google'], example: 'local' },
      isActive: { type: 'boolean', example: true },
      lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
      ...timestamps,
    },
  },

  Department: {
    type: 'object',
    properties: {
      _id: objectId,
      name: { type: 'string', example: 'Registrar' },
      code: { type: 'string', example: 'REG' },
      description: { type: 'string', example: 'Handles student records and enrollment.' },
      isActive: { type: 'boolean', example: true },
      satisfactionTarget: {
        type: 'number',
        nullable: true,
        example: null,
        description: 'V2.8 — optional override of OrganizationSettings.defaultSatisfactionTarget for this department. null means "use the organization default."',
      },
      ...timestamps,
    },
  },

  Building: {
    type: 'object',
    description: 'V2.3 — a physical campus/building (docs/v2/V2_3_BUILDING_LOCATION.md). Global master data, not owned by any Department.',
    properties: {
      _id: objectId,
      name: { type: 'string', example: 'Taft Campus' },
      code: { type: 'string', example: 'TAFT' },
      description: { type: 'string', example: 'Main Taft Avenue campus.' },
      isActive: { type: 'boolean', example: true },
      ...timestamps,
    },
  },

  Location: {
    type: 'object',
    description: 'A precise service point/window. As of V2.3, belongs to exactly one Department and one Building.',
    properties: {
      _id: objectId,
      name: { type: 'string', example: 'Registrar Front Desk' },
      code: { type: 'string', example: 'REG-FD' },
      description: { type: 'string', example: '' },
      departmentId: objectId,
      buildingId: objectId,
      isActive: { type: 'boolean', example: true },
      ...timestamps,
    },
  },

  ServiceType: {
    type: 'object',
    description: 'V2.6 — a configurable service/transaction category owned by exactly one Department. code/name are unique only within their owning department, not globally (e.g. "Clearance" may legitimately exist in both Registrar and Library).',
    properties: {
      _id: objectId,
      departmentId: { ...objectId, description: 'Immutable after creation.' },
      name: { type: 'string', example: 'Enrollment / Registration' },
      code: { type: 'string', example: 'REG-SVC-01' },
      description: { type: 'string', example: '' },
      isActive: { type: 'boolean', example: true },
      sortOrder: { type: 'integer', example: 1 },
      ...timestamps,
    },
  },

  Personnel: {
    type: 'object',
    properties: {
      _id: objectId,
      employeeNumber: { type: 'string', example: 'EMP-0007' },
      firstName: { type: 'string', example: 'Maria' },
      middleName: { type: 'string', example: '' },
      lastName: { type: 'string', example: 'Cruz' },
      suffix: { type: 'string', example: '' },
      fullName: { type: 'string', readOnly: true, example: 'Maria Cruz' },
      email: { type: 'string', format: 'email', example: 'mcruz@fbms.edu' },
      contactNumber: { type: 'string', example: '+63 917 000 0000' },
      position: { type: 'string', example: 'Registrar Personnel' },
      departmentId: objectId,
      userId: { ...objectId, nullable: true, description: 'Optional one-to-one link to a User login account.' },
      isActive: { type: 'boolean', example: true },
      pinSetAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'V2.4 — set whenever a Staff PIN is (re)provisioned. Never exposes the PIN or its hash; use this only to tell whether a PIN has been configured.',
      },
      ...timestamps,
    },
  },

  Tablet: {
    type: 'object',
    description: 'Never exposes deviceSecretHash. activationToken is intentionally plaintext (an admin-viewable pairing code, not a secret).',
    properties: {
      _id: objectId,
      deviceName: { type: 'string', example: 'Registrar Kiosk 1' },
      deviceCode: { type: 'string', example: 'REG-T1' },
      locationId: objectId,
      departmentId: { ...objectId, description: 'Always server-derived from locationId.' },
      serialNumber: { type: 'string', example: '' },
      activationToken: { type: 'string', example: 'TAB-4F92A1C7' },
      activationConsumedAt: { type: 'string', format: 'date-time', nullable: true },
      isActive: { type: 'boolean', example: true },
      lastSeen: { type: 'string', format: 'date-time', nullable: true },
      appVersion: { type: 'string', example: '1.0.0' },
      androidVersion: { type: 'string', example: '' },
      notes: { type: 'string', example: '' },
      ...timestamps,
    },
  },
  MonitoredTablet: {
    type: 'object',
    description:
      'Live Monitoring’s own Tablet projection — a deliberately different (smaller) field set than the Tablet schema. Never includes activationToken (explicitly excluded at the query level, per this module’s "never expose Activation Token" requirement), serialNumber, notes, or timestamps.',
    properties: {
      _id: objectId,
      deviceCode: { type: 'string', example: 'REG-T1' },
      deviceName: { type: 'string', example: 'Registrar Kiosk 1' },
      departmentId: objectId,
      locationId: objectId,
      isActive: { type: 'boolean', example: true },
      lastSeen: { type: 'string', format: 'date-time', nullable: true },
      appVersion: { type: 'string', example: '1.0.0' },
      androidVersion: { type: 'string', example: '' },
      activationConsumedAt: { type: 'string', format: 'date-time', nullable: true },
      status: { type: 'string', enum: ['online', 'offline', 'inactive'], example: 'online' },
      assignedSurvey: {
        type: 'object',
        nullable: true,
        properties: { _id: objectId, title: { type: 'string', example: 'Registrar Office Feedback' } },
      },
      lastFeedbackAt: { type: 'string', format: 'date-time', nullable: true },
      feedbackCount: { type: 'integer', example: 12 },
    },
  },

  Question: {
    type: 'object',
    properties: {
      _id: objectId,
      surveyId: objectId,
      questionText: { type: 'string', example: 'How satisfied were you with the service today?' },
      questionType: {
        type: 'string',
        enum: ['rating', 'yes_no', 'multiple_choice', 'short_text', 'long_text'],
        example: 'rating',
      },
      required: { type: 'boolean', example: true },
      order: { type: 'integer', example: 1 },
      options: {
        type: 'array',
        items: { type: 'string' },
        example: [],
        description: 'Only populated when questionType is multiple_choice.',
      },
      serviceQualityCategory: {
        type: 'string',
        enum: ['courtesy', 'clarity', 'waiting_time'],
        nullable: true,
        example: null,
        description: 'V2.5 — standardized management-dimension mapping. Only ever set on a rating question; null when this question is not one of the three core dimensions.',
      },
      ...timestamps,
    },
  },

  Survey: {
    type: 'object',
    properties: {
      _id: objectId,
      title: { type: 'string', example: 'Registrar Office Feedback' },
      description: { type: 'string', example: '' },
      departmentId: { ...objectId, nullable: true },
      locationId: { ...objectId, nullable: true },
      isPublished: { type: 'boolean', example: true },
      isArchived: { type: 'boolean', example: false },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      questionCount: { type: 'integer', example: 5 },
      assignmentType: { type: 'string', enum: ['global', 'department', 'location'], readOnly: true },
      status: { type: 'string', enum: ['draft', 'published', 'archived'], readOnly: true },
      ...timestamps,
    },
  },

  FeedbackSession: {
    type: 'object',
    properties: {
      _id: objectId,
      referenceCode: { type: 'string', example: 'FB-2026-000123' },
      surveyId: objectId,
      tabletId: objectId,
      locationId: objectId,
      departmentId: { ...objectId, description: 'Always derived from the collecting tablet’s own department.' },
      submittedAt: { type: 'string', format: 'date-time' },
      completedAt: { type: 'string', format: 'date-time' },
      durationSeconds: { type: 'integer', example: 42 },
      status: { type: 'string', enum: ['completed'], example: 'completed' },
      serviceSessionId: { ...objectId, nullable: true, description: 'V2.4 — set only for feedback submitted via /api/v2/mobile/feedback while a staff ServiceSession was active. null for every pre-V2.4 or v1-submitted session.' },
      personnelId: {
        nullable: true,
        description: 'V2.4 — historical attribution snapshot, populated to a small Personnel projection on read. null when no staff was serving (or the session predates V2.4).',
        oneOf: [
          { ...objectId },
          {
            type: 'object',
            properties: {
              _id: objectId,
              firstName: { type: 'string', example: 'Maria' },
              middleName: { type: 'string', example: '' },
              lastName: { type: 'string', example: 'Cruz' },
              suffix: { type: 'string', example: '' },
              employeeNumber: { type: 'string', example: 'EMP-0007' },
            },
          },
        ],
      },
      buildingId: { ...objectId, nullable: true, description: 'V2.4 — snapshotted from the ServiceSession at submission time, not the tablet’s current Location.' },
      serviceTypeId: { ...objectId, nullable: true, description: 'V2.6 — set only for feedback submitted via /api/v2/mobile/feedback, where it is required. Independently verified server-side to belong to the same department as the submitting tablet. null for every pre-V2.6 or v1-submitted session.' },
      respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'], nullable: true, example: 'student', description: 'V2.7 — optional, anonymous classification only (no name/ID collected). Set only for feedback submitted via /api/v2/mobile/feedback, where it is allowed but never required. null for every pre-V2.7 or v1-submitted session, or any V2 session where the respondent skipped it.' },
      ...timestamps,
    },
  },

  ServiceSession: {
    type: 'object',
    description: 'V2.4 — one staff member serving at a Tablet/Location during a time interval, opened by Staff PIN login and closed by logout. Read-only through the admin API; mutated only via /api/v2/mobile/staff/*.',
    properties: {
      _id: objectId,
      personnelId: {
        description: 'Populated to a small Personnel projection on read.',
        oneOf: [
          { ...objectId },
          {
            type: 'object',
            properties: {
              _id: objectId,
              firstName: { type: 'string', example: 'Maria' },
              middleName: { type: 'string', example: '' },
              lastName: { type: 'string', example: 'Cruz' },
              suffix: { type: 'string', example: '' },
              employeeNumber: { type: 'string', example: 'EMP-0007' },
              position: { type: 'string', example: 'Registrar Personnel' },
            },
          },
        ],
      },
      departmentId: objectId,
      buildingId: objectId,
      locationId: objectId,
      tabletId: objectId,
      startedAt: { type: 'string', format: 'date-time' },
      endedAt: { type: 'string', format: 'date-time', nullable: true },
      status: { type: 'string', enum: ['active', 'ended'], example: 'active' },
      ...timestamps,
    },
  },
  FeedbackAnswer: {
    type: 'object',
    properties: {
      _id: objectId,
      feedbackSessionId: objectId,
      questionId: objectId,
      questionType: {
        type: 'string',
        enum: ['rating', 'yes_no', 'multiple_choice', 'short_text', 'long_text'],
      },
      answer: {
        description: 'Shape depends on questionType: rating=integer 1-5, yes_no=boolean, multiple_choice/short_text/long_text=string.',
        oneOf: [{ type: 'integer' }, { type: 'boolean' }, { type: 'string' }],
        example: 5,
      },
      serviceQualityCategory: {
        type: 'string',
        enum: ['courtesy', 'clarity', 'waiting_time'],
        nullable: true,
        example: null,
        description: 'V2.5 — snapshotted from the answered Question at submission time, never re-derived. null when the answered question had no category mapping.',
      },
      ...timestamps,
    },
  },

  OrganizationSettings: {
    type: 'object',
    description: 'A singleton document — one per deployment.',
    properties: {
      _id: objectId,
      universityName: { type: 'string', example: 'De La Salle-College of Saint Benilde' },
      address: { type: 'string', example: '2544 Taft Ave, Malate, Manila' },
      contactNumber: { type: 'string', example: '+63 2 8230 5100' },
      email: { type: 'string', format: 'email', example: 'info@benilde.edu.ph' },
      contactPerson: { type: 'string', example: 'Office of the Registrar' },
      primaryColor: { type: 'string', example: '#002E1F' },
      secondaryColor: { type: 'string', example: '#FFB81C' },
      logoUrl: { type: 'string', example: '/uploads/logos/logo-1712345678-abc123.png' },
      logoOriginalName: { type: 'string', example: 'benilde-logo.png' },
      logoUploadedAt: { type: 'string', format: 'date-time', nullable: true },
      mobileHeartbeatIntervalSeconds: { type: 'integer', example: 300 },
      mobileMinAppVersion: { type: 'string', example: '1.0.0' },
      feedbackSessionTimeoutSeconds: { type: 'integer', example: 120 },
      defaultTrendWindowDays: { type: 'integer', enum: [7, 30], example: 7 },
      defaultPaginationSize: { type: 'integer', example: 20 },
      timezone: { type: 'string', example: 'Asia/Manila' },
      dateFormat: { type: 'string', enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'], example: 'MM/DD/YYYY' },
      timeFormat: { type: 'string', enum: ['12h', '24h'], example: '12h' },
      defaultSatisfactionTarget: {
        type: 'number',
        example: 4,
        description: 'V2.8 — institution-wide Satisfaction KPI target (1-5 rating scale), used whenever no Department override is configured.',
      },
      ...timestamps,
    },
  },

  AuditLog: {
    type: 'object',
    properties: {
      _id: objectId,
      actorUserId: { ...objectId, nullable: true },
      actorDisplayName: { type: 'string', example: 'Alex Santos' },
      actorEmail: { type: 'string', format: 'email', example: 'admin@fbms.edu' },
      actorRole: { type: 'string', nullable: true, example: 'super_admin' },
      action: { type: 'string', example: 'tablet.regenerate_token' },
      entityType: {
        type: 'string',
        enum: ['auth', 'settings', 'department', 'location', 'personnel', 'tablet', 'survey', 'question', 'developerPortal'],
      },
      entityId: { ...objectId, nullable: true },
      entityLabel: { type: 'string', example: 'Registrar Kiosk 1' },
      departmentId: { ...objectId, nullable: true },
      outcome: { type: 'string', enum: ['success', 'failure'], example: 'success' },
      metadata: {
        type: 'object',
        nullable: true,
        description: 'Small, sanitized context object (secret/token/password/hash-shaped keys are stripped server-side before storage). Shape varies by action.',
        additionalProperties: true,
      },
      ipAddress: { type: 'string', nullable: true, example: '127.0.0.1' },
      userAgent: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  DashboardSummary: {
    type: 'object',
    properties: {
      cards: {
        type: 'object',
        properties: {
          departmentsCount: { type: 'integer', example: 2 },
          locationsCount: { type: 'integer', example: 4 },
          personnelCount: { type: 'integer', example: 8 },
          tabletsCount: { type: 'integer', example: 4 },
          onlineTabletsCount: { type: 'integer', example: 3 },
          offlineTabletsCount: { type: 'integer', example: 1 },
          activeSurveysCount: { type: 'integer', example: 2 },
          feedbackToday: { type: 'integer', example: 14 },
          totalFeedback: { type: 'integer', example: 3010 },
          averageRating: { type: 'number', nullable: true, example: 4.32 },
        },
      },
      charts: {
        type: 'object',
        properties: {
          feedbackTrend: {
            type: 'array',
            items: {
              type: 'object',
              properties: { date: { type: 'string', example: '2026-08-01' }, count: { type: 'integer', example: 12 } },
            },
          },
          feedbackByDepartment: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                departmentId: objectId,
                departmentName: { type: 'string', example: 'Registrar' },
                count: { type: 'integer', example: 1800 },
              },
            },
          },
          feedbackBySurvey: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                surveyId: objectId,
                surveyTitle: { type: 'string', example: 'Registrar Office Feedback' },
                count: { type: 'integer', example: 1800 },
              },
            },
          },
          feedbackByMonth: {
            type: 'array',
            description:
              'V2.1.1 (Monthly Feedback Breakdown, Issue 4) — purely additive field, spans from the earliest in-scope session\'s month through the current month (capped at 12 months), zero-filled.',
            items: {
              type: 'object',
              properties: {
                month: { type: 'string', example: '2026-08', description: 'YYYY-MM' },
                count: { type: 'integer', example: 340 },
              },
            },
          },
          tabletStatusDistribution: {
            type: 'object',
            properties: { online: { type: 'integer' }, offline: { type: 'integer' }, inactive: { type: 'integer' } },
          },
          surveyStatusDistribution: {
            type: 'object',
            properties: { draft: { type: 'integer' }, published: { type: 'integer' }, archived: { type: 'integer' } },
          },
        },
      },
      recentFeedback: {
        type: 'array',
        items: { $ref: '#/components/schemas/FeedbackSession' },
      },
      satisfactionKpi,
    },
  },

  ReportsSummary: {
    type: 'object',
    properties: {
      filters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string', nullable: true },
          dateTo: { type: 'string', nullable: true },
          departmentId: { type: 'string', nullable: true },
          locationId: { type: 'string', nullable: true },
          surveyId: { type: 'string', nullable: true },
        },
      },
      summary: {
        type: 'object',
        properties: {
          totalFeedback: { type: 'integer', example: 3010 },
          averageRating: { type: 'number', nullable: true, example: 4.32 },
          feedbackToday: { type: 'integer', example: 14 },
          feedbackThisWeek: { type: 'integer', example: 88 },
          feedbackThisMonth: { type: 'integer', example: 340 },
          activeSurveysCount: { type: 'integer', example: 2 },
          activeTabletsCount: { type: 'integer', example: 4 },
          departmentsRepresented: { type: 'integer', example: 2 },
        },
      },
      feedbackTrend: {
        type: 'array',
        items: {
          type: 'object',
          properties: { date: { type: 'string', example: '2026-08-01' }, count: { type: 'integer', example: 12 } },
        },
      },
      ratingDistribution: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rating: { type: 'integer', example: 5 },
            count: { type: 'integer', example: 1200 },
            percentage: { type: 'number', example: 42.5 },
          },
        },
      },
      feedbackByDepartment: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            departmentId: objectId,
            departmentName: { type: 'string' },
            count: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      feedbackBySurvey: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            surveyId: objectId,
            surveyTitle: { type: 'string' },
            count: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      feedbackByLocation: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            locationId: objectId,
            locationName: { type: 'string' },
            departmentId: objectId,
            departmentName: { type: 'string' },
            count: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      feedbackByServiceType: {
        type: 'array',
        description: 'V2.6 — volume + average rating per Service Type. Empty for any scope with no serviceTypeId-attributed feedback (e.g. legacy data, or every v1-only submission).',
        items: {
          type: 'object',
          properties: {
            serviceTypeId: objectId,
            serviceTypeName: { type: 'string' },
            departmentId: objectId,
            count: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      feedbackByRespondentType: {
        type: 'array',
        description: 'V2.7 — volume + average rating per Respondent Type. Empty for any scope with no respondentType-attributed feedback (every v1-only submission, and any V2 session where the respondent skipped the optional field).',
        items: {
          type: 'object',
          properties: {
            respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] },
            respondentTypeLabel: { type: 'string', example: 'Student' },
            count: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      feedbackByServiceTypeAndRespondentType: {
        type: 'array',
        description: 'V2.7 — the Service Type × Respondent Type cross-tab. Only sessions carrying both a serviceTypeId and a respondentType snapshot contribute a row.',
        items: {
          type: 'object',
          properties: {
            serviceTypeId: objectId,
            serviceTypeName: { type: 'string' },
            departmentId: objectId,
            respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] },
            respondentTypeLabel: { type: 'string', example: 'Student' },
            count: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      surveyPerformance: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            surveyId: objectId,
            title: { type: 'string' },
            assignmentType: { type: 'string', enum: ['Global', 'Department', 'Location'] },
            isPublished: { type: 'boolean' },
            feedbackCount: { type: 'integer' },
            averageRating: { type: 'number', nullable: true },
          },
        },
      },
      tabletContribution: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tabletId: objectId,
            deviceName: { type: 'string' },
            departmentId: objectId,
            departmentName: { type: 'string' },
            locationId: objectId,
            locationName: { type: 'string' },
            feedbackCount: { type: 'integer' },
            lastFeedbackAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
      serviceQuality: {
        type: 'object',
        description: 'V2.5 — Courtesy/Clarity/Waiting Time/Overall, scoped identically to every other section of this report. null for a dimension with no in-scope categorized rating answers yet ("no data", never averaged as 0).',
        properties: {
          courtesy: { type: 'number', nullable: true, example: 4.7 },
          clarity: { type: 'number', nullable: true, example: 4.5 },
          waitingTime: { type: 'number', nullable: true, example: 3.6 },
          overall: { type: 'number', nullable: true, example: 4.27, description: 'Arithmetic mean of whichever of the three dimensions have data.' },
          byDepartment: {
            type: 'array',
            description: 'The Office × Service Quality Category heatmap. Only meaningful as a cross-department comparison — a department-scoped caller\'s response always has at most one row (same convention as feedbackByDepartment).',
            items: {
              type: 'object',
              properties: {
                departmentId: objectId,
                departmentName: { type: 'string', example: 'Registrar' },
                courtesy: { type: 'number', nullable: true },
                clarity: { type: 'number', nullable: true },
                waitingTime: { type: 'number', nullable: true },
                overall: { type: 'number', nullable: true },
              },
            },
          },
          byServiceType: {
            type: 'array',
            description: 'V2.6 — the same Category breakdown, grouped by Service Type instead of Department. A rating answer whose session has no serviceTypeId is never grouped here.',
            items: {
              type: 'object',
              properties: {
                serviceTypeId: objectId,
                serviceTypeName: { type: 'string', example: 'Enrollment / Registration' },
                departmentId: objectId,
                courtesy: { type: 'number', nullable: true },
                clarity: { type: 'number', nullable: true },
                waitingTime: { type: 'number', nullable: true },
                overall: { type: 'number', nullable: true },
              },
            },
          },
          byRespondentType: {
            type: 'array',
            description: 'V2.7 — the same Category breakdown, grouped by Respondent Type instead of Department. A rating answer whose session has no respondentType is never grouped here.',
            items: {
              type: 'object',
              properties: {
                respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] },
                respondentTypeLabel: { type: 'string', example: 'Student' },
                courtesy: { type: 'number', nullable: true },
                clarity: { type: 'number', nullable: true },
                waitingTime: { type: 'number', nullable: true },
                overall: { type: 'number', nullable: true },
              },
            },
          },
        },
      },
      satisfactionKpi,
    },
  },

  AdvancedAnalytics: {
    type: 'object',
    description: 'V2.9 — Advanced Role-Specific Analytics (docs/v2/V2_9_ADVANCED_ANALYTICS.md). `roleView` discriminates which single shape `data` holds: "institution" (Super Admin/Senior Leadership, institution-wide), "office" (Department Head, own Office only), or "personal" (Personnel, own individual attribution-based data only). Count/rating breakdown arrays (feedbackByServiceType, feedbackByRespondentType, etc.) and quality-category breakdown arrays (serviceQualityByServiceType, etc.) intentionally mirror ReportsSummary\'s own field shapes so the same id-based join the frontend already performs for Reports works unchanged here.',
    properties: {
      roleView: { type: 'string', enum: ['institution', 'office', 'personal'], example: 'institution' },
      filters: {
        type: 'object',
        properties: {
          departmentId: { type: 'string', nullable: true },
          buildingId: { type: 'string', nullable: true },
          dateFrom: { type: 'string', nullable: true },
          dateTo: { type: 'string', nullable: true },
        },
      },
      data: {
        description: 'Shape depends on roleView — see the "institution"/"office"/"personal" examples below. All row arrays use the same "no rows for unattributed data" convention as ReportsSummary (e.g. a Building with zero attributed feedback simply never appears).',
        oneOf: [
          {
            title: 'institution',
            type: 'object',
            properties: {
              officeRanking: {
                type: 'array',
                description: 'Every Department ranked by average rating, highest first (ties broken by volume; departments with no rating data sort last).',
                items: {
                  type: 'object',
                  properties: {
                    departmentId: objectId,
                    departmentName: { type: 'string' },
                    count: { type: 'integer' },
                    averageRating: { type: 'number', nullable: true },
                    rank: { type: 'integer', example: 1 },
                  },
                },
              },
              buildingPerformance: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { buildingId: objectId, buildingName: { type: 'string' }, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } },
                },
              },
              locationPerformance: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { locationId: objectId, locationName: { type: 'string' }, departmentId: objectId, departmentName: { type: 'string' }, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } },
                },
              },
              serviceQualityHeatmap: {
                type: 'array',
                description: 'Office × Service Quality Category, same shape as ReportsSummary.serviceQuality.byDepartment.',
                items: {
                  type: 'object',
                  properties: { departmentId: objectId, departmentName: { type: 'string' }, courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } },
                },
              },
              monthlyTrend: {
                type: 'array',
                items: { type: 'object', properties: { month: { type: 'string', example: '2026-08' }, count: { type: 'integer' } } },
              },
              ratingDistribution: {
                type: 'array',
                items: { type: 'object', properties: { rating: { type: 'integer' }, count: { type: 'integer' }, percentage: { type: 'number' } } },
              },
              feedbackByServiceType: { type: 'array', items: { type: 'object', properties: { serviceTypeId: objectId, serviceTypeName: { type: 'string' }, departmentId: objectId, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              serviceQualityByServiceType: { type: 'array', items: { type: 'object', properties: { serviceTypeId: objectId, serviceTypeName: { type: 'string' }, departmentId: objectId, courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } } },
              feedbackByRespondentType: { type: 'array', items: { type: 'object', properties: { respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] }, respondentTypeLabel: { type: 'string' }, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              serviceQualityByRespondentType: { type: 'array', items: { type: 'object', properties: { respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] }, respondentTypeLabel: { type: 'string' }, courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } } },
              satisfactionKpi,
              peakHours: {
                type: 'object',
                properties: {
                  byHour: { type: 'array', items: { type: 'object', properties: { hour: { type: 'integer', minimum: 0, maximum: 23 }, count: { type: 'integer' } } } },
                  byDayOfWeek: { type: 'array', items: { type: 'object', properties: { day: { type: 'string', example: 'Monday' }, count: { type: 'integer' } } } },
                  busiestHour: { type: 'integer', nullable: true },
                  busiestDayOfWeek: { type: 'string', nullable: true },
                },
              },
              periodComparison: {
                type: 'object',
                description: 'Current vs. immediately-preceding rolling window of equal length (7/30 days, or the resolved default).',
                properties: {
                  current: { type: 'object', properties: { averageRating: { type: 'number', nullable: true }, feedbackCount: { type: 'integer' } } },
                  previous: { type: 'object', properties: { averageRating: { type: 'number', nullable: true }, feedbackCount: { type: 'integer' } } },
                  percentageChange: { type: 'number', nullable: true, description: 'Feedback volume percentage change vs. the previous window. null when the previous window had zero feedback.' },
                  ratingDelta: { type: 'number', nullable: true },
                },
              },
            },
          },
          {
            title: 'office',
            type: 'object',
            properties: {
              departmentId: objectId,
              departmentName: { type: 'string', example: 'Registrar' },
              serviceQuality: { type: 'object', properties: { courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } },
              buildingComparison: { type: 'array', items: { type: 'object', properties: { buildingId: objectId, buildingName: { type: 'string' }, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              windowComparison: { type: 'array', description: 'Feedback by Location ("Service Window"), scoped to this Office.', items: { type: 'object', properties: { locationId: objectId, locationName: { type: 'string' }, departmentId: objectId, departmentName: { type: 'string' }, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              staffPerformance: { type: 'array', items: { type: 'object', properties: { personnelId: objectId, personnelName: { type: 'string' }, departmentId: objectId, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              staffServiceQuality: { type: 'array', items: { type: 'object', properties: { personnelId: objectId, personnelName: { type: 'string' }, departmentId: objectId, courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } } },
              feedbackByServiceType: { type: 'array', items: { type: 'object', properties: { serviceTypeId: objectId, serviceTypeName: { type: 'string' }, departmentId: objectId, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              serviceQualityByServiceType: { type: 'array', items: { type: 'object', properties: { serviceTypeId: objectId, serviceTypeName: { type: 'string' }, departmentId: objectId, courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } } },
              feedbackByRespondentType: { type: 'array', items: { type: 'object', properties: { respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] }, respondentTypeLabel: { type: 'string' }, count: { type: 'integer' }, averageRating: { type: 'number', nullable: true } } } },
              serviceQualityByRespondentType: { type: 'array', items: { type: 'object', properties: { respondentType: { type: 'string', enum: ['student', 'employee', 'visitor'] }, respondentTypeLabel: { type: 'string' }, courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } } },
              trend: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, count: { type: 'integer' } } } },
              recentComments: {
                type: 'array',
                description: 'Most recent short_text/long_text answers in scope, newest first, capped at 20. Never includes an empty-string answer.',
                items: { type: 'object', properties: { feedbackSessionId: objectId, referenceCode: { type: 'string', example: 'FB-2026-000004' }, questionText: { type: 'string' }, answer: { type: 'string' }, submittedAt: { type: 'string', format: 'date-time' } } },
              },
              lowRatingPatterns: {
                type: 'object',
                description: 'byLocation only lists a Location once it has accumulated 2+ low ratings (<=2) in scope — a single isolated low rating never singles out a Service Window.',
                properties: {
                  lowRatingCount: { type: 'integer' },
                  totalRatingCount: { type: 'integer' },
                  lowRatingPercentage: { type: 'number' },
                  byLocation: { type: 'array', items: { type: 'object', properties: { locationId: objectId, locationName: { type: 'string' }, lowRatingCount: { type: 'integer' } } } },
                },
              },
            },
          },
          {
            title: 'personal',
            type: 'object',
            description: 'Personnel\'s own individual data, resolved via the Personnel record linked to the logged-in User (Personnel.userId). hasAttributionData is false only when the logged-in Personnel-role user has no linked Personnel record at all — a linked record with zero attributed feedback still reports hasAttributionData: true with feedbackCount: 0.',
            properties: {
              personnelId: { ...objectId, nullable: true },
              fullName: { type: 'string', nullable: true, example: 'Andrea Reyes' },
              hasAttributionData: { type: 'boolean' },
              averageRating: { type: 'number', nullable: true },
              feedbackCount: { type: 'integer' },
              serviceQuality: { type: 'object', properties: { courtesy: { type: 'number', nullable: true }, clarity: { type: 'number', nullable: true }, waitingTime: { type: 'number', nullable: true }, overall: { type: 'number', nullable: true } } },
              recentTrend: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, count: { type: 'integer' } } } },
              recentComments: {
                type: 'array',
                items: { type: 'object', properties: { feedbackSessionId: objectId, referenceCode: { type: 'string' }, questionText: { type: 'string' }, answer: { type: 'string' }, submittedAt: { type: 'string', format: 'date-time' } } },
              },
            },
          },
        ],
      },
      insights: {
        type: 'array',
        description: 'Deterministic numeric insights only — no ML (docs/v2/V2_9_ADVANCED_ANALYTICS.md). Each source of data (monthly trend, category averages, period comparison, recent-N-response trend) only contributes an insight when it genuinely supports one; nothing is fabricated from partial data.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['highest_feedback_month', 'consecutive_trend', 'best_category', 'worst_category', 'percentage_change', 'current_vs_previous', 'recent_rating_trend'] },
            label: { type: 'string', example: 'August 2026 had the highest feedback volume (5 responses).' },
            value: { type: 'object', description: 'The raw figures behind label, shape depends on type.' },
          },
        },
      },
    },
  },

  LiveMonitoringSummary: {
    type: 'object',
    properties: {
      onlineCount: { type: 'integer', example: 3 },
      offlineCount: { type: 'integer', example: 1 },
      inactiveCount: { type: 'integer', example: 0 },
      feedbackToday: { type: 'integer', example: 14 },
      activeSurveysCount: { type: 'integer', example: 2 },
      departmentsCount: { type: 'integer', example: 2 },
      locationsCount: { type: 'integer', example: 4 },
    },
  },

  HealthResponse: {
    type: 'object',
    description: 'The one endpoint that does not use the standard { success, message, data } envelope — version is a top-level field by design.',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'FBMS API is running.' },
      version: { type: 'string', example: '1.0.0' },
    },
  },

  MobileConfig: {
    type: 'object',
    description: 'Only the fields the Android client actually needs — no institutional contact info, no internal ids or counts.',
    properties: {
      systemName: { type: 'string', example: 'De La Salle-College of Saint Benilde' },
      logoUrl: { type: 'string', example: '/uploads/logos/logo-1712345678-abc123.png' },
      primaryColor: { type: 'string', example: '#002E1F' },
      secondaryColor: { type: 'string', example: '#FFB81C' },
      heartbeatIntervalSeconds: { type: 'integer', example: 300 },
      minAppVersion: { type: 'string', example: '1.0.0' },
      feedbackSessionTimeoutSeconds: { type: 'integer', example: 120 },
    },
  },
};
