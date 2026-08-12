/**
 * V2.11B — sibling manifest to routeInventoryManifest.js, scoped to the
 * genuinely new /api/v2/mobile/* operations only (not the reused
 * heartbeat/config/survey/sync, which share the v1 contract exactly —
 * see paths/mobileV2.js). Kept separate from ROUTE_INVENTORY because that
 * manifest's own dynamic-dispatch check hardcodes an `/api/v1` prefix
 * (routeInventory.test.js); these paths resolve against `/api/v2/mobile`
 * instead, so mixing them into one list/prefix would either miss real
 * routes or falsely flag them as phantom.
 *
 * Paths here are relative to /api/v2/mobile for readability (matching the
 * short-path convention routeInventoryManifest.js uses) — routeInventory
 * .test.js prepends `/api/v2/mobile` itself when comparing against
 * openApiDocument.paths, whose keys for this module are the FULL absolute
 * path (see paths/mobileV2.js's header comment for why: a short key here
 * would collide with an unrelated /api/v1 admin resource of the same
 * short name).
 */
export const ROUTE_INVENTORY_V2_MOBILE = [
  ['POST', '/staff/login'],
  ['POST', '/staff/logout'],
  ['GET', '/staff/active'],
  ['GET', '/service-types'],
  ['GET', '/respondent-types'],
  ['POST', '/feedback'],
];
