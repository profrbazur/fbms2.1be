/**
 * Independent transcription of the real /api/v1 route inventory, read
 * directly from backend/src/routes/index.js and each mounted route file
 * (never derived from backend/src/docs/openapi/, which is what this
 * manifest checks against) — see routeInventory.test.js. Express 5's
 * router internals do not expose a mounted sub-router's own prefix
 * statically before a matching request is dispatched (only leaf
 * `layer.route.path`/methods are available without dispatch), so a fully
 * dynamic mount-prefix walk isn't practical without either probing every
 * prefix (circular — the prefixes are exactly what we're trying to
 * discover) or monkeypatching Express's Router internals (fragile across
 * versions) — see this phase's completion report for the fuller
 * rationale. This manifest is the deliberately simple alternative: keep
 * it in sync whenever routes/index.js's mount table changes.
 *
 * `{id}` uses OpenAPI's own path-parameter syntax (Express uses `:id`).
 */
export const ROUTE_INVENTORY = [
  ['GET', '/health'],
  ['POST', '/auth/login'],
  ['GET', '/auth/me'],
  ['POST', '/auth/logout'],
  ['GET', '/dashboard/summary'],
  ['GET', '/feedback'],
  ['GET', '/feedback/{id}'],
  ['GET', '/organization'],
  ['PATCH', '/organization'],
  ['GET', '/departments'],
  ['GET', '/departments/{id}'],
  ['POST', '/departments'],
  ['PATCH', '/departments/{id}'],
  ['GET', '/buildings'],
  ['GET', '/buildings/{id}'],
  ['POST', '/buildings'],
  ['PATCH', '/buildings/{id}'],
  ['GET', '/locations'],
  ['GET', '/locations/{id}'],
  ['POST', '/locations'],
  ['PATCH', '/locations/{id}'],
  ['GET', '/personnel/linkable-users'],
  ['GET', '/personnel'],
  ['GET', '/personnel/{id}'],
  ['POST', '/personnel'],
  ['PATCH', '/personnel/{id}'],
  ['GET', '/tablets'],
  ['GET', '/tablets/{id}'],
  ['POST', '/tablets'],
  ['PATCH', '/tablets/{id}'],
  ['POST', '/tablets/{id}/regenerate-token'],
  ['POST', '/personnel/{id}/regenerate-pin'],
  ['GET', '/service-sessions'],
  ['GET', '/service-sessions/{id}'],
  ['GET', '/surveys'],
  ['GET', '/surveys/{id}'],
  ['POST', '/surveys'],
  ['PATCH', '/surveys/{id}'],
  ['POST', '/surveys/{id}/publish'],
  ['POST', '/surveys/{id}/unpublish'],
  ['POST', '/surveys/{id}/archive'],
  ['GET', '/surveys/{id}/questions'],
  ['POST', '/surveys/{id}/questions'],
  ['PATCH', '/questions/{id}'],
  ['GET', '/reports/feedback-summary'],
  ['GET', '/settings'],
  ['PATCH', '/settings'],
  ['POST', '/settings/logo'],
  ['GET', '/audit-logs'],
  ['GET', '/audit-logs/{id}'],
  ['POST', '/mobile/activate'],
  ['POST', '/mobile/heartbeat'],
  ['GET', '/mobile/config'],
  ['GET', '/mobile/survey'],
  ['POST', '/mobile/feedback'],
  ['POST', '/mobile/sync'],
  ['GET', '/live-monitoring/summary'],
  ['GET', '/live-monitoring/tablets'],
  ['GET', '/live-monitoring/tablets/{id}'],
  ['POST', '/developer-portal/reload-canonical-dataset'],
];
