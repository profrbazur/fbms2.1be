import Department from '../models/Department.js';
import Survey from '../models/Survey.js';
import Question from '../models/Question.js';

/**
 * Clearly non-production sample surveys: one Global (visible to every
 * department), one Registrar Department survey, one Library Department
 * survey (left unpublished/draft to demonstrate the non-published state
 * in the seeded data). Each carries a realistic mix of all five
 * supported question types.
 *
 * Seeder writes go directly through the Mongoose models rather than
 * surveyService.js/questionService.js — the same convention already
 * used by organizationSeeder.js/personnelSeeder.js/tabletSeeder.js —
 * since the service layer's publish-gating (a published/archived
 * survey rejects further question writes) would otherwise block
 * re-seeding a survey this seeder intentionally leaves published.
 */
const SURVEYS = [
  {
    title: 'General Service Feedback',
    description: 'System-wide feedback collected across all offices (sample data).',
    departmentCode: null,
    publish: true,
    questions: [
      {
        questionText: 'How would you rate your overall experience today?',
        questionType: 'rating',
        required: true,
        order: 1,
      },
      {
        questionText: 'Would you recommend our services to others?',
        questionType: 'yes_no',
        required: true,
        order: 2,
      },
      {
        questionText: 'Do you have any additional comments?',
        questionType: 'long_text',
        required: false,
        order: 3,
      },
      // V2.5 — the three standardized management dimensions
      // (backend/docs/v2/V2_5_SERVICE_QUALITY.md), optional here since
      // this is the shared system-wide survey rather than a
      // department's own dedicated one — not every General Service
      // Feedback submission needs to answer all three (see
      // feedbackSeeder.js's REG-tablet sessions, which deliberately
      // leave these unanswered to exercise "partial responses").
      {
        questionText: 'How courteous and helpful was the staff who assisted you?',
        questionType: 'rating',
        required: false,
        order: 4,
        serviceQualityCategory: 'courtesy',
      },
      {
        questionText: 'How clearly was the process or information explained to you?',
        questionType: 'rating',
        required: false,
        order: 5,
        serviceQualityCategory: 'clarity',
      },
      {
        questionText: 'How satisfied are you with the waiting time for service?',
        questionType: 'rating',
        required: false,
        order: 6,
        serviceQualityCategory: 'waiting_time',
      },
    ],
  },
  {
    title: 'Registrar Office Feedback',
    description: 'Feedback for enrollment, records, and registration services (sample data).',
    departmentCode: 'REG',
    publish: true,
    questions: [
      {
        questionText: 'How satisfied are you with the registration process?',
        questionType: 'rating',
        required: true,
        order: 1,
      },
      {
        questionText: 'Which service did you avail today?',
        questionType: 'multiple_choice',
        required: true,
        order: 2,
        options: ['Enrollment', 'Document Request', 'Grade Inquiry', 'Other'],
      },
      {
        questionText: 'Was your concern resolved?',
        questionType: 'yes_no',
        required: false,
        order: 3,
      },
      {
        questionText: 'Any suggestions for improvement?',
        questionType: 'short_text',
        required: false,
        order: 4,
      },
      // V2.5 — Registrar's own office-specific wording for the same
      // three standardized categories the Global survey above also
      // carries (courtesy/clarity/waiting_time are canonical
      // identifiers, not question text — see backend/docs/v2/
      // V2_5_SERVICE_QUALITY.md). Required here, unlike the Global
      // survey's copies — this is Registrar's own dedicated management
      // survey.
      {
        questionText: 'How helpful and courteous was the staff who assisted you?',
        questionType: 'rating',
        required: true,
        order: 5,
        serviceQualityCategory: 'courtesy',
      },
      {
        questionText: 'How clearly was the registration process explained?',
        questionType: 'rating',
        required: true,
        order: 6,
        serviceQualityCategory: 'clarity',
      },
      {
        questionText: 'How satisfied are you with the time it took to complete your transaction?',
        questionType: 'rating',
        required: true,
        order: 7,
        serviceQualityCategory: 'waiting_time',
      },
    ],
  },
  {
    title: 'Library Services Feedback',
    description: 'Feedback for circulation, study spaces, and digital resources (sample data).',
    departmentCode: 'LIB',
    publish: false,
    questions: [
      {
        questionText: 'How would you rate the availability of study spaces?',
        questionType: 'rating',
        required: true,
        order: 1,
      },
      {
        questionText: 'What type of resource did you use today?',
        questionType: 'multiple_choice',
        required: true,
        order: 2,
        options: ['Books', 'Digital Resources', 'Study Room', 'Printing'],
      },
      {
        questionText: 'Additional feedback about library services',
        questionType: 'long_text',
        required: false,
        order: 3,
      },
    ],
  },
];

/**
 * Idempotent: matched by `title` (Survey has no dedicated unique
 * business key — unlike Department/Location/Personnel/Tablet's
 * code/employeeNumber/deviceCode — so the seeder itself is the single
 * source of truth for these three canonical sample titles). Each
 * question is matched by { surveyId, questionText } within its parent
 * survey; the denormalized `questionCount` is only incremented the
 * first time a question is inserted, never on a re-run update, keeping
 * it accurate under repeated seeding.
 */
export async function seedSurveys() {
  const departmentCodes = [...new Set(SURVEYS.map((s) => s.departmentCode).filter(Boolean))];
  const departments = await Department.find({ code: { $in: departmentCodes } });
  const departmentIdByCode = Object.fromEntries(
    departments.map((department) => [department.code, department._id]),
  );

  let surveyCount = 0;
  let questionCount = 0;

  for (const definition of SURVEYS) {
    const departmentId = definition.departmentCode
      ? departmentIdByCode[definition.departmentCode]
      : null;

    if (definition.departmentCode && !departmentId) {
      continue;
    }

    const survey = await Survey.findOneAndUpdate(
      { title: definition.title },
      {
        $set: {
          description: definition.description,
          departmentId,
          locationId: null,
          isArchived: false,
        },
        $setOnInsert: { questionCount: 0 },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    surveyCount += 1;

    for (const questionDefinition of definition.questions) {
      const existing = await Question.findOne({
        surveyId: survey._id,
        questionText: questionDefinition.questionText,
      });

      if (existing) {
        await Question.updateOne(
          { _id: existing._id },
          {
            $set: {
              questionType: questionDefinition.questionType,
              required: questionDefinition.required,
              order: questionDefinition.order,
              options: questionDefinition.options || [],
              serviceQualityCategory: questionDefinition.serviceQualityCategory ?? null,
            },
          },
        );
      } else {
        await Question.create({
          surveyId: survey._id,
          questionText: questionDefinition.questionText,
          questionType: questionDefinition.questionType,
          required: questionDefinition.required,
          order: questionDefinition.order,
          options: questionDefinition.options || [],
          serviceQualityCategory: questionDefinition.serviceQualityCategory ?? null,
        });
        await Survey.updateOne({ _id: survey._id }, { $inc: { questionCount: 1 } });
      }
      questionCount += 1;
    }

    await Survey.updateOne(
      { _id: survey._id },
      {
        $set: definition.publish
          ? { isPublished: true, publishedAt: survey.publishedAt || new Date() }
          : { isPublished: false, publishedAt: null },
      },
    );
  }

  return { surveyCount, questionCount };
}
