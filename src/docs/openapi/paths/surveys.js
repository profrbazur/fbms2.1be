import { successEnvelope, commonResponses, parameters } from '../components.js';

const surveyWriteBody = (required) => ({
  type: 'object',
  required,
  properties: {
    title: { type: 'string', example: 'Registrar Office Feedback' },
    description: { type: 'string' },
    departmentId: { type: 'string', nullable: true },
    locationId: { type: 'string', nullable: true },
  },
  description: 'Exactly one of departmentId/locationId (or neither, for Global) may be set. isPublished/isArchived/publishedAt/questionCount are server-managed only.',
});

const questionCreateBody = {
  type: 'object',
  required: ['questionText', 'questionType'],
  properties: {
    questionText: { type: 'string', example: 'How satisfied were you with the service today?' },
    questionType: { type: 'string', enum: ['rating', 'yes_no', 'multiple_choice', 'short_text', 'long_text'] },
    required: { type: 'boolean' },
    order: { type: 'integer', minimum: 1 },
    options: { type: 'array', items: { type: 'string' }, description: 'Required only when questionType is multiple_choice.' },
  },
};

export const surveysPaths = {
  '/surveys': {
    get: {
      tags: ['Surveys'],
      summary: 'List surveys',
      operationId: 'listSurveys',
      security: [{ bearerAuth: [] }],
      parameters: [
        parameters.departmentIdFilter,
        { name: 'locationId', in: 'query', schema: { type: 'string' } },
        { name: 'isPublished', in: 'query', schema: { type: 'boolean' } },
        { name: 'isArchived', in: 'query', schema: { type: 'boolean' } },
        parameters.search,
        parameters.page,
        parameters.limit,
      ],
      responses: {
        200: {
          description: 'Surveys retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope(
                { type: 'object', properties: { surveys: { type: 'array', items: { $ref: '#/components/schemas/Survey' } }, pagination: { $ref: '#/components/schemas/Pagination' } } },
                'Surveys retrieved successfully.',
              ),
            },
          },
        },
        401: commonResponses.Unauthorized,
      },
    },
    post: {
      tags: ['Surveys'],
      summary: 'Create a survey',
      description: 'Super Admin only. Created as an unpublished draft — use the publish action to make it live.',
      operationId: 'createSurvey',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: surveyWriteBody(['title']) } } },
      responses: {
        201: {
          description: 'Survey created successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' } } }, 'Survey created successfully.') } },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
      },
    },
  },
  '/surveys/{id}': {
    get: {
      tags: ['Surveys'],
      summary: 'Get a survey by id',
      operationId: 'getSurvey',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Survey retrieved successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' } } }, 'Survey retrieved successfully.') } },
        },
        401: commonResponses.Unauthorized,
        404: commonResponses.NotFound,
      },
    },
    patch: {
      tags: ['Surveys'],
      summary: 'Update a survey',
      description: 'Super Admin only. Partial update — at least one field required. A published or archived survey is read-only (fails validation on the business-rule check, not the field validator).',
      operationId: 'updateSurvey',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: surveyWriteBody([]) } } },
      responses: {
        200: {
          description: 'Survey updated successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' } } }, 'Survey updated successfully.') } },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
  '/surveys/{id}/publish': {
    post: {
      tags: ['Surveys'],
      summary: 'Publish a survey',
      description: 'Super Admin only. Requires at least one question. Only one non-archived survey may exist per location.',
      operationId: 'publishSurvey',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Survey published successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' } } }, 'Survey published successfully.') } },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
  '/surveys/{id}/unpublish': {
    post: {
      tags: ['Surveys'],
      summary: 'Unpublish a survey',
      description: 'Super Admin only. Returns the survey to draft status.',
      operationId: 'unpublishSurvey',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Survey unpublished successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' } } }, 'Survey unpublished successfully.') } },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
  '/surveys/{id}/archive': {
    post: {
      tags: ['Surveys'],
      summary: 'Archive a survey',
      description: 'Super Admin only. Archived surveys are permanently read-only and excluded from mobile survey resolution.',
      operationId: 'archiveSurvey',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Survey archived successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { survey: { $ref: '#/components/schemas/Survey' } } }, 'Survey archived successfully.') } },
        },
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
  '/surveys/{id}/questions': {
    get: {
      tags: ['Surveys'],
      summary: 'List a survey’s questions',
      operationId: 'listSurveyQuestions',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      responses: {
        200: {
          description: 'Survey questions retrieved successfully.',
          content: {
            'application/json': {
              schema: successEnvelope({ type: 'object', properties: { questions: { type: 'array', items: { $ref: '#/components/schemas/Question' } } } }, 'Survey questions retrieved successfully.'),
            },
          },
        },
        401: commonResponses.Unauthorized,
        404: commonResponses.NotFound,
      },
    },
    post: {
      tags: ['Surveys'],
      summary: 'Add a question to a survey',
      description: 'Super Admin only. surveyId comes from the path, never the body.',
      operationId: 'createSurveyQuestion',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: { required: true, content: { 'application/json': { schema: questionCreateBody } } },
      responses: {
        201: {
          description: 'Question created successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { question: { $ref: '#/components/schemas/Question' } } }, 'Question created successfully.') } },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
  '/questions/{id}': {
    patch: {
      tags: ['Surveys'],
      summary: 'Update a question',
      description: 'Super Admin only. Partial update — at least one field required.',
      operationId: 'updateQuestion',
      security: [{ bearerAuth: [] }],
      parameters: [parameters.idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                questionText: { type: 'string' },
                questionType: { type: 'string', enum: ['rating', 'yes_no', 'multiple_choice', 'short_text', 'long_text'] },
                required: { type: 'boolean' },
                order: { type: 'integer', minimum: 1 },
                options: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Question updated successfully.',
          content: { 'application/json': { schema: successEnvelope({ type: 'object', properties: { question: { $ref: '#/components/schemas/Question' } } }, 'Question updated successfully.') } },
        },
        400: commonResponses.ValidationError,
        401: commonResponses.Unauthorized,
        403: commonResponses.Forbidden,
        404: commonResponses.NotFound,
      },
    },
  },
};
