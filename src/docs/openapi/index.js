/**
 * FBMS V2.1 — OpenAPI 3.0 specification assembly.
 *
 * Architecture decision (docs/DECISIONS.md ADR-053): the spec is
 * hand-composed from plain JS modules (this file + ./components.js +
 * ./paths/*.js) rather than generated from JSDoc comments scattered
 * across every controller/route file. This project's routes/controllers
 * have no existing JSDoc-annotation convention, and 53 endpoints'-worth of
 * `@openapi` YAML blocks embedded in application source would both
 * pollute those files and duplicate large schema fragments across many of
 * them. A modular "one file per resource" composition keeps the same
 * per-resource organization the rest of the codebase already uses
 * (backend/src/routes/<resource>/, backend/src/controllers/<resource>...)
 * while keeping the spec itself in one place, easy to keep in sync with
 * the real route inventory (see backend/tests/openapi/ for the
 * regression check).
 *
 * This is purely additive documentation — it describes the existing,
 * frozen Version 1 API (docs/DECISIONS.md ADR-051/ADR-052) exactly as
 * implemented. No route, field, status code, or contract was changed to
 * produce it.
 */
import { securitySchemes, schemas } from './components.js';
import { systemPaths } from './paths/system.js';
import { authPaths } from './paths/auth.js';
import { organizationPaths } from './paths/organization.js';
import { departmentsPaths } from './paths/departments.js';
import { buildingsPaths } from './paths/buildings.js';
import { locationsPaths } from './paths/locations.js';
import { serviceTypesPaths } from './paths/serviceTypes.js';
import { personnelPaths } from './paths/personnel.js';
import { tabletsPaths } from './paths/tablets.js';
import { serviceSessionsPaths } from './paths/serviceSessions.js';
import { surveysPaths } from './paths/surveys.js';
import { feedbackPaths } from './paths/feedback.js';
import { dashboardPaths } from './paths/dashboard.js';
import { reportsPaths } from './paths/reports.js';
import { analyticsPaths } from './paths/analytics.js';
import { liveMonitoringPaths } from './paths/liveMonitoring.js';
import { notificationsPaths } from './paths/notifications.js';
import { settingsPaths } from './paths/settings.js';
import { auditLogsPaths } from './paths/auditLogs.js';
import { developerPortalPaths } from './paths/developerPortal.js';
import { mobilePaths } from './paths/mobile.js';
import { mobileV2Paths } from './paths/mobileV2.js';

const tags = [
  { name: 'System', description: 'Unauthenticated liveness check.' },
  { name: 'Authentication', description: 'Staff login/current-user/logout (JWT).' },
  { name: 'Organization', description: 'University profile, branding, and mobile-facing operational settings (singleton).' },
  { name: 'Departments', description: 'Departments master data.' },
  { name: 'Buildings', description: 'V2.3 — physical campus/building master data (docs/v2/V2_3_BUILDING_LOCATION.md).' },
  { name: 'Locations', description: 'Locations/service windows master data — each belongs to a Department and, as of V2.3, a Building.' },
  { name: 'Service Types', description: 'V2.6 — configurable service/transaction categories owned by a Department, unique only within that department (docs/v2/V2_6_SERVICE_TYPES.md).' },
  { name: 'Personnel', description: 'Organizational personnel records (separate from User login accounts).' },
  { name: 'Tablets', description: 'Kiosk tablet registration and activation-token lifecycle.' },
  { name: 'Service Sessions', description: 'V2.4 — read-only view of Staff PIN service sessions (personnel currently/previously serving at a tablet). Mutated only via /api/v2/mobile/staff/*.' },
  { name: 'Surveys', description: 'Surveys, questions, and the publish/unpublish/archive lifecycle.' },
  { name: 'Feedback', description: 'Read-only, immutable, anonymous feedback sessions and answers.' },
  { name: 'Dashboard', description: 'Role-scoped operational summary.' },
  { name: 'Reports', description: 'Consolidated read-only feedback analytics report.' },
  { name: 'Analytics', description: 'V2.9 — role-specific advanced analytics (institution/office/personal views), docs/v2/V2_9_ADVANCED_ANALYTICS.md.' },
  { name: 'Live Monitoring', description: 'Real-time-ish tablet status, assigned survey, and recent activity.' },
  { name: 'Notifications', description: 'V2.10 — derived, read-only notifications (device offline, satisfaction below target, repeated low-rating pattern). No persistence, docs/v2/V2_FUTURE_ROADMAP.md.' },
  { name: 'Settings', description: 'A second route surface over the same OrganizationSettings singleton, plus logo upload.' },
  { name: 'Audit Logs', description: 'Append-only administrative action history (Super Admin only).' },
  { name: 'Developer Portal', description: 'Super-Admin-only teaching/demo utility.' },
  { name: 'Mobile API', description: 'The frozen Version 1 Android kiosk contract (/api/v1/mobile/*) — Device Secret authentication, never staff JWT. Still the current contract for the existing mobile/ Android app. Coexists unmodified alongside Mobile API V2 below.' },
  { name: 'Mobile API V2 (Staff PIN Kiosk)', description: 'V2.4+ — the enhanced kiosk workflow at /api/v2/mobile/*, a sibling namespace to /api/v1 (not nested under it). Adds Staff PIN login/ServiceSession, Service Type (V2.6) and Respondent Type (V2.7) attribution on top of the same Device Secret authentication as Mobile API. A future mobilev2 Android project should target this contract, not the V1 Mobile API tag above.' },
];

const paths = {
  ...systemPaths,
  ...authPaths,
  ...organizationPaths,
  ...departmentsPaths,
  ...buildingsPaths,
  ...locationsPaths,
  ...serviceTypesPaths,
  ...personnelPaths,
  ...tabletsPaths,
  ...serviceSessionsPaths,
  ...surveysPaths,
  ...feedbackPaths,
  ...dashboardPaths,
  ...reportsPaths,
  ...analyticsPaths,
  ...liveMonitoringPaths,
  ...notificationsPaths,
  ...settingsPaths,
  ...auditLogsPaths,
  ...developerPortalPaths,
  ...mobilePaths,
  ...mobileV2Paths,
};

/**
 * `servers` intentionally leads with a relative URL — it resolves against
 * whatever origin actually served the spec (works unmodified for local
 * dev, Render, or any future host, per this phase's "must not depend on
 * one developer machine" requirement) rather than a hardcoded Render URL
 * that docs/DEPLOYMENT.md itself notes is "not yet recorded" for this
 * project. The explicit localhost entry is a convenience for a developer
 * who pastes the spec into an external tool (e.g. Postman) where a
 * relative URL has no origin to resolve against.
 */
export function buildOpenApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'FBMS API',
      version: '1.0.0',
      description:
        'Feedback Management System (FBMS) REST API — the shared backend for the React administration web app and the Android kiosk mobile app(s). The admin/web surface and the frozen Version 1 mobile kiosk contract are versioned under `/api/v1` (see `docs/DECISIONS.md` ADR-051/ADR-052; OpenAPI/Swagger documentation itself is a Version 2.1, purely additive enhancement — no endpoint, field, status code, or authorization rule described here was changed to produce it). A second, currently-supported mobile generation — the enhanced Staff PIN kiosk workflow added in V2.4 — is a **sibling namespace at `/api/v2/mobile/*`, not nested under `/api/v1`**; see the "Mobile API V2 (Staff PIN Kiosk)" tag. A future `mobilev2` Android project should target that V2 contract, not the frozen V1 one.\n\n' +
        'Two authentication schemes exist and are never interchangeable: **bearerAuth** (staff JWT, `Authorization: Bearer <token>`) for every `/api/v1/*` route except `/mobile/*`, and **deviceAuth** (tablet Device Secret, `Authorization: Device <secret>`) for every `/api/v1/mobile/*` and `/api/v2/mobile/*` route. See each scheme’s own description below for the full flow.\n\n' +
        'All responses use one of two envelopes: `{ success, message, data }` on success, `{ success, message, errors }` on failure (see the ErrorResponse schema) — with one documented exception, `GET /health`.',
      contact: { name: 'FBMS Developer Portal', url: '/administration/developer-portal' },
      license: { name: 'UNLICENSED — internal academic project, not for redistribution' },
    },
    servers: [
      { url: '/api/v1', description: 'Current origin (works unmodified for local development and any deployed environment).' },
      { url: 'http://localhost:5000/api/v1', description: 'Local development (default port).' },
    ],
    tags,
    security: [{ bearerAuth: [] }],
    components: { securitySchemes, schemas },
    paths,
  };
}

export const openApiDocument = buildOpenApiDocument();
