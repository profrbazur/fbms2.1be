import Survey from '../models/Survey.js';
import Question from '../models/Question.js';
import Tablet from '../models/Tablet.js';
import Personnel from '../models/Personnel.js';
import ServiceSession from '../models/ServiceSession.js';
import ServiceType from '../models/ServiceType.js';
import FeedbackSession from '../models/FeedbackSession.js';
import FeedbackAnswer from '../models/FeedbackAnswer.js';
import { validateAnswerForQuestion } from '../services/feedbackService.js';

/**
 * Clearly non-production sample feedback sessions, generated only
 * against the two surveys surveySeeder.js currently leaves published
 * ("General Service Feedback" [Global] and "Registrar Office Feedback")
 * — "Library Services Feedback" is seeded as a draft, and a real tablet
 * could never have retrieved/submitted against an unpublished survey.
 * Distributed across all 4 seeded tablets so both Registrar and Library
 * have their own sessions (departmentId is derived from each tablet's
 * own department, not the survey's — a Global survey answered from a
 * Library tablet still belongs to Library, per this phase's "always
 * derive departmentId from Location" rule) for department-isolation
 * testing. `answer` values are matched to each survey's actual
 * question text/order and re-validated through
 * feedbackService.validateAnswerForQuestion — the exact validation a
 * future mobile submission endpoint will also use.
 *
 * V2.6 — six sessions (FB004, FB005, FB007-010) additionally carry a
 * `serviceTypeCode`, spread across four distinct Registrar service
 * types and two distinct Library service types (see
 * serviceTypeSeeder.js), so both "multiple service types per
 * department" and the Office × Service Type analytics have real data.
 * FB001-003 and FB006 deliberately have no serviceTypeCode at all —
 * legacy/unattributed feedback that must remain readable and must never
 * be misclassified into any service type.
 *
 * V2.7 — nine sessions (all but FB006) additionally carry a
 * `respondentType` (student/employee/visitor — backend/docs/v2/
 * V2_7_RESPONDENT_TYPE.md), distributed so every value appears at least
 * twice (student: FB001/004/007/010, employee: FB002/005/009, visitor:
 * FB003/008) and overlapping with `serviceTypeCode` on six sessions
 * (FB004/005/007/008/009/010) so the Service Type × Respondent Type
 * cross-tab has real data to show. FB006 deliberately has neither a
 * serviceTypeCode nor a respondentType — fully legacy/unattributed
 * feedback that must remain readable.
 */
const FEEDBACK_SESSIONS = [
  {
    referenceCode: 'FB-2026-000001',
    surveyTitle: 'General Service Feedback',
    tabletDeviceCode: 'REG-TAB-01',
    submittedAt: '2026-07-20T09:15:00.000Z',
    completedAt: '2026-07-20T09:16:40.000Z',
    // V2.4 — attributed to the matching seeded ServiceSession (see
    // serviceSessionSeeder.js). Only the first five sessions carry
    // attribution; FB-2026-000006 through 000010 stay unattributed on
    // purpose, to also exercise "existing feedback without ServiceSession
    // remains readable."
    attributedEmployeeNumber: 'REG-0002',
    // V2.7 — see this file's own FEEDBACK_SESSIONS comment.
    respondentType: 'student',
    answers: [
      { questionText: 'How would you rate your overall experience today?', answer: 5 },
      { questionText: 'Would you recommend our services to others?', answer: true },
      {
        questionText: 'Do you have any additional comments?',
        answer: 'Staff were very helpful and quick to assist.',
      },
    ],
  },
  {
    referenceCode: 'FB-2026-000002',
    surveyTitle: 'General Service Feedback',
    tabletDeviceCode: 'REG-TAB-01',
    submittedAt: '2026-07-22T13:05:00.000Z',
    completedAt: '2026-07-22T13:06:30.000Z',
    attributedEmployeeNumber: 'REG-0003',
    respondentType: 'employee',
    answers: [
      { questionText: 'How would you rate your overall experience today?', answer: 4 },
      { questionText: 'Would you recommend our services to others?', answer: true },
      {
        questionText: 'Do you have any additional comments?',
        answer: 'Overall a good experience, slight wait time.',
      },
    ],
  },
  {
    referenceCode: 'FB-2026-000003',
    surveyTitle: 'General Service Feedback',
    tabletDeviceCode: 'REG-TAB-02',
    submittedAt: '2026-07-24T10:40:00.000Z',
    completedAt: '2026-07-24T10:41:50.000Z',
    attributedEmployeeNumber: 'REG-0004',
    respondentType: 'visitor',
    answers: [
      { questionText: 'How would you rate your overall experience today?', answer: 2 },
      { questionText: 'Would you recommend our services to others?', answer: false },
      {
        questionText: 'Do you have any additional comments?',
        answer: 'Had to wait a long time before being assisted.',
      },
    ],
  },
  {
    referenceCode: 'FB-2026-000004',
    surveyTitle: 'General Service Feedback',
    tabletDeviceCode: 'LIB-TAB-01',
    submittedAt: '2026-07-25T14:20:00.000Z',
    completedAt: '2026-07-25T14:21:15.000Z',
    attributedEmployeeNumber: 'LIB-0002',
    // V2.6/V2.7 — see this file's own FEEDBACK_SESSIONS comment.
    serviceTypeCode: 'LIB-SVC-01',
    respondentType: 'student',
    answers: [
      { questionText: 'How would you rate your overall experience today?', answer: 5 },
      { questionText: 'Would you recommend our services to others?', answer: true },
      { questionText: 'Do you have any additional comments?', answer: 'The library staff were excellent.' },
      // V2.5 — Library's category-mapped ratings, via the shared Global
      // survey (Library Services Feedback stays draft — see
      // surveySeeder.js — so this is currently the only published
      // survey a Library tablet can answer these on).
      { questionText: 'How courteous and helpful was the staff who assisted you?', answer: 3 },
      { questionText: 'How clearly was the process or information explained to you?', answer: 4 },
      { questionText: 'How satisfied are you with the waiting time for service?', answer: 5 },
    ],
  },
  {
    referenceCode: 'FB-2026-000005',
    surveyTitle: 'General Service Feedback',
    tabletDeviceCode: 'LIB-TAB-02',
    submittedAt: '2026-07-27T11:00:00.000Z',
    completedAt: '2026-07-27T11:01:20.000Z',
    attributedEmployeeNumber: 'LIB-0003',
    serviceTypeCode: 'LIB-SVC-03',
    respondentType: 'employee',
    answers: [
      { questionText: 'How would you rate your overall experience today?', answer: 3 },
      { questionText: 'Would you recommend our services to others?', answer: true },
      { questionText: 'Do you have any additional comments?', answer: '' },
      { questionText: 'How courteous and helpful was the staff who assisted you?', answer: 4 },
      { questionText: 'How clearly was the process or information explained to you?', answer: 4 },
      { questionText: 'How satisfied are you with the waiting time for service?', answer: 4 },
    ],
  },
  {
    referenceCode: 'FB-2026-000006',
    surveyTitle: 'General Service Feedback',
    tabletDeviceCode: 'REG-TAB-01',
    submittedAt: '2026-07-29T08:50:00.000Z',
    completedAt: '2026-07-29T08:51:30.000Z',
    answers: [
      { questionText: 'How would you rate your overall experience today?', answer: 1 },
      { questionText: 'Would you recommend our services to others?', answer: false },
      {
        questionText: 'Do you have any additional comments?',
        answer: 'Very disappointing service today, needs improvement.',
      },
    ],
  },
  {
    referenceCode: 'FB-2026-000007',
    surveyTitle: 'Registrar Office Feedback',
    tabletDeviceCode: 'REG-TAB-01',
    submittedAt: '2026-07-30T09:05:00.000Z',
    completedAt: '2026-07-30T09:07:00.000Z',
    serviceTypeCode: 'REG-SVC-01',
    respondentType: 'student',
    answers: [
      { questionText: 'How satisfied are you with the registration process?', answer: 5 },
      { questionText: 'Which service did you avail today?', answer: 'Enrollment' },
      { questionText: 'Was your concern resolved?', answer: true },
      { questionText: 'Any suggestions for improvement?', answer: 'Keep up the great work!' },
      // V2.5 — Registrar's own office-worded category ratings (see
      // surveySeeder.js). Strong Courtesy/Clarity, weaker Waiting Time
      // across FB007-010 — a deliberate, intentional contrast with
      // Library's pattern (see FB004/FB005 above), so the Office ×
      // Category heatmap has something real to show.
      { questionText: 'How helpful and courteous was the staff who assisted you?', answer: 5 },
      { questionText: 'How clearly was the registration process explained?', answer: 5 },
      { questionText: 'How satisfied are you with the time it took to complete your transaction?', answer: 4 },
    ],
  },
  {
    referenceCode: 'FB-2026-000008',
    surveyTitle: 'Registrar Office Feedback',
    tabletDeviceCode: 'REG-TAB-02',
    submittedAt: '2026-08-01T15:30:00.000Z',
    completedAt: '2026-08-01T15:32:10.000Z',
    serviceTypeCode: 'REG-SVC-03',
    respondentType: 'visitor',
    answers: [
      { questionText: 'How satisfied are you with the registration process?', answer: 4 },
      { questionText: 'Which service did you avail today?', answer: 'Document Request' },
      { questionText: 'Was your concern resolved?', answer: true },
      { questionText: 'Any suggestions for improvement?', answer: 'Fast processing.' },
      { questionText: 'How helpful and courteous was the staff who assisted you?', answer: 4 },
      { questionText: 'How clearly was the registration process explained?', answer: 4 },
      { questionText: 'How satisfied are you with the time it took to complete your transaction?', answer: 3 },
    ],
  },
  {
    referenceCode: 'FB-2026-000009',
    surveyTitle: 'Registrar Office Feedback',
    tabletDeviceCode: 'REG-TAB-01',
    submittedAt: '2026-08-03T10:10:00.000Z',
    completedAt: '2026-08-03T10:11:45.000Z',
    serviceTypeCode: 'REG-SVC-02',
    respondentType: 'employee',
    answers: [
      { questionText: 'How satisfied are you with the registration process?', answer: 3 },
      { questionText: 'Which service did you avail today?', answer: 'Grade Inquiry' },
      { questionText: 'Was your concern resolved?', answer: false },
      {
        questionText: 'Any suggestions for improvement?',
        answer: 'Still waiting for a response on my inquiry.',
      },
      { questionText: 'How helpful and courteous was the staff who assisted you?', answer: 4 },
      { questionText: 'How clearly was the registration process explained?', answer: 3 },
      { questionText: 'How satisfied are you with the time it took to complete your transaction?', answer: 2 },
    ],
  },
  {
    referenceCode: 'FB-2026-000010',
    surveyTitle: 'Registrar Office Feedback',
    tabletDeviceCode: 'REG-TAB-02',
    submittedAt: '2026-08-05T16:00:00.000Z',
    completedAt: '2026-08-05T16:01:35.000Z',
    serviceTypeCode: 'REG-SVC-06',
    respondentType: 'student',
    answers: [
      { questionText: 'How satisfied are you with the registration process?', answer: 5 },
      { questionText: 'Which service did you avail today?', answer: 'Other' },
      { questionText: 'Was your concern resolved?', answer: true },
      { questionText: 'Any suggestions for improvement?', answer: 'No complaints, excellent service.' },
      { questionText: 'How helpful and courteous was the staff who assisted you?', answer: 5 },
      { questionText: 'How clearly was the registration process explained?', answer: 5 },
      { questionText: 'How satisfied are you with the time it took to complete your transaction?', answer: 5 },
    ],
  },
];

/**
 * The full set of reference codes this seeder owns — the small,
 * deterministic V2 Development Dataset baseline (see
 * backend/dev-data/README.md). generateCanonicalDataset.js's
 * REFERENCE_CODE_START = 11 continues numbering directly after these,
 * so this list is also the boundary seedDevelopmentDataset.js uses to
 * safely strip any larger canonical/demo bulk data back down to just
 * this baseline without touching this module's own definitions.
 */
export const SEEDED_REFERENCE_CODES = FEEDBACK_SESSIONS.map((definition) => definition.referenceCode);

/**
 * Idempotent: each session is matched/upserted by its unique
 * `referenceCode` (the seeder's own stable business key, same
 * convention as Survey's title-matching — see surveySeeder.js); each
 * answer is matched/upserted by { feedbackSessionId, questionId }.
 * `durationSeconds` is always recomputed from submittedAt/completedAt
 * rather than hardcoded, so the two can never drift out of sync.
 * Sessions/answers referencing a survey, tablet, or question that
 * doesn't exist yet (e.g. this seeder run before surveySeeder/
 * tabletSeeder) are safely skipped, matching tabletSeeder.js/
 * surveySeeder.js's own "skip if a dependency is missing" convention.
 */
export async function seedFeedback() {
  let sessionCount = 0;
  let answerCount = 0;

  for (const definition of FEEDBACK_SESSIONS) {
    const survey = await Survey.findOne({ title: definition.surveyTitle });
    const tablet = await Tablet.findOne({ deviceCode: definition.tabletDeviceCode });

    if (!survey || !tablet) {
      continue;
    }

    const submittedAt = new Date(definition.submittedAt);
    const completedAt = new Date(definition.completedAt);
    const durationSeconds = Math.round((completedAt.getTime() - submittedAt.getTime()) / 1000);

    // V2.4 — resolves the optional historical-attribution snapshot (see
    // this file's own FEEDBACK_SESSIONS comment and
    // serviceSessionSeeder.js). Silently stays null (not an error) when
    // the definition has no attributedEmployeeNumber, or the referenced
    // Personnel/ServiceSession doesn't exist yet — the same
    // "skip if a dependency is missing" convention used throughout.
    let attribution = { serviceSessionId: null, personnelId: null, buildingId: null };
    if (definition.attributedEmployeeNumber) {
      const personnel = await Personnel.findOne({ employeeNumber: definition.attributedEmployeeNumber });
      if (personnel) {
        const serviceSession = await ServiceSession.findOne({
          personnelId: personnel._id,
          tabletId: tablet._id,
        });
        if (serviceSession) {
          attribution = {
            serviceSessionId: serviceSession._id,
            personnelId: personnel._id,
            buildingId: serviceSession.buildingId,
          };
        }
      }
    }

    // V2.6 — resolves the optional Service Type snapshot (see this
    // file's own FEEDBACK_SESSIONS comment). Silently stays null (not an
    // error) when the definition has no serviceTypeCode, or the
    // referenced ServiceType doesn't exist yet — the same "skip if a
    // dependency is missing" convention used throughout, and also the
    // deliberate mechanism for exercising "legacy feedback without a
    // Service Type" (FB001-003, FB006 have no serviceTypeCode at all).
    let serviceTypeId = null;
    if (definition.serviceTypeCode) {
      const serviceType = await ServiceType.findOne({
        departmentId: tablet.departmentId,
        code: definition.serviceTypeCode,
      });
      if (serviceType) {
        serviceTypeId = serviceType._id;
      }
    }

    const session = await FeedbackSession.findOneAndUpdate(
      { referenceCode: definition.referenceCode },
      {
        $set: {
          surveyId: survey._id,
          tabletId: tablet._id,
          locationId: tablet.locationId,
          departmentId: tablet.departmentId,
          submittedAt,
          completedAt,
          durationSeconds,
          status: 'completed',
          ...attribution,
          serviceTypeId,
          // V2.7 — see this file's own FEEDBACK_SESSIONS comment. No
          // lookup needed (unlike serviceTypeId) — a fixed enum value,
          // or null when the definition has none (FB006).
          respondentType: definition.respondentType ?? null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    sessionCount += 1;

    for (const answerDefinition of definition.answers) {
      const question = await Question.findOne({
        surveyId: survey._id,
        questionText: answerDefinition.questionText,
      });

      if (!question) {
        continue;
      }

      const normalizedAnswer = validateAnswerForQuestion(question, answerDefinition.answer);

      await FeedbackAnswer.findOneAndUpdate(
        { feedbackSessionId: session._id, questionId: question._id },
        {
          $set: {
            questionType: question.questionType,
            answer: normalizedAnswer,
            // V2.5 — snapshotted from the question's current mapping,
            // exactly like feedbackService.createFeedbackSession does
            // for a real submission (see that function's own comment).
            serviceQualityCategory: question.serviceQualityCategory ?? null,
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      answerCount += 1;
    }
  }

  return { sessionCount, answerCount };
}
