// V2.2: Senior Leadership is a second global, read-only role alongside
// Super Admin — see backend/docs/v2/V2_BACKEND_ARCHITECTURE.md's Role
// Model. Every read-path department-scoping check across the services
// (analyticsService/departmentService/locationService/personnelService/
// tabletService/liveMonitoringService/feedbackService/surveyService)
// treats both roles identically: unscoped, institution-wide visibility.
// Mutation routes are unaffected by this helper — every write route keeps
// its own explicit `authorizeRoles('super_admin')` allow-list, so
// Senior Leadership is never granted write access by extension here.
export const GLOBAL_READ_ROLES = ['super_admin', 'senior_leadership'];

export function isGlobalReadRole(role) {
  return GLOBAL_READ_ROLES.includes(role);
}
