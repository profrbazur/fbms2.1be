import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { openApiDocument } from '../../src/docs/openapi/index.js';
import { ROUTE_INVENTORY } from './routeInventoryManifest.js';
import { ROUTE_INVENTORY_V2_MOBILE } from './routeInventoryManifestV2Mobile.js';

const PLACEHOLDER_ID = '000000000000000000000000';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

function toOpenApiKey([method, path]) {
  return `${method} ${path}`;
}

describe('API inventory regression (Express routes vs. OpenAPI paths)', () => {
  it('documents every route in the manifest, and documents nothing extra', () => {
    // Scoped to the /api/v1-only manifest — Mobile API V2 operations are
    // real (verified by the dedicated describe block below) but out of
    // this manifest's scope by design (see routeInventoryManifest.js).
    // Path-item-level sibling keys like `servers` (used by V2.11B's new
    // mobileV2.js) are not HTTP methods and must be filtered out here,
    // same as openapiDocument.test.js's collectOperations already does.
    const documented = new Set();
    Object.entries(openApiDocument.paths).forEach(([pathKey, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        if (!HTTP_METHODS.includes(method)) return;
        if (operation?.tags?.includes('Mobile API V2 (Staff PIN Kiosk)')) return;
        documented.add(`${method.toUpperCase()} ${pathKey}`);
      });
    });

    const manifestKeys = new Set(ROUTE_INVENTORY.map(toOpenApiKey));

    const missingFromDocs = [...manifestKeys].filter((key) => !documented.has(key));
    const undocumentedExtras = [...documented].filter((key) => !manifestKeys.has(key));

    expect(missingFromDocs, 'routes that exist but are not documented in OpenAPI').toEqual([]);
    expect(undocumentedExtras, 'OpenAPI paths that do not correspond to a real route').toEqual([]);
  });

  /**
   * The Version 1 API freeze (ADR-051/ADR-052) recorded 53 endpoints at
   * the time. docs/v2/V2_API_VERSIONING.md's "Additive Changes" policy
   * explicitly allows new, backward-compatible endpoints to remain
   * under /api/v1 — V2.3 added 4 Building endpoints
   * (GET/POST /buildings, GET/PATCH /buildings/{id}), V2.4 added 3
   * more (POST /personnel/{id}/regenerate-pin, GET /service-sessions,
   * GET /service-sessions/{id}) — the admin-facing, additive half of
   * V2.4; the breaking kiosk workflow itself lives under
   * /api/v2/mobile/*, outside this /api/v1-only inventory by design —
   * and V2.6 added 4 Service Type endpoints (GET/POST /service-types,
   * GET/PATCH /service-types/{id}), the admin-facing half of that phase
   * (its own breaking-workflow-adjacent addition, GET
   * /api/v2/mobile/service-types, is likewise outside this inventory).
   * V2.9 added 1 more additive endpoint (GET /analytics/advanced).
   * V2.10 added 1 more additive endpoint (GET /notifications).
   */
  it('matches the current endpoint count (53 frozen V1 + 4 additive V2.3 Building + 3 additive V2.4 + 4 additive V2.6 Service Type + 1 additive V2.9 Analytics + 1 additive V2.10 Notifications endpoints)', () => {
    expect(ROUTE_INVENTORY.length).toBe(66);
  });

  /**
   * Dynamically confirms every documented path+method actually resolves to
   * a real Express route on the live app — dispatches each one
   * unauthenticated and asserts the response is NOT the generic
   * notFoundHandler 404 ("Route not found: ..."). Any other status
   * (200/400/401/403/404-from-application-logic) proves Express matched a
   * real route, since every protected route's authenticate/
   * authenticateDevice middleware runs before any handler logic and would
   * itself produce a 401, not a 404. This is the "no invented endpoints"
   * half of the regression check; the manifest above covers the "nothing
   * undocumented" half — see routeInventoryManifest.js for why a fully
   * dynamic mount-prefix walk isn't practical under Express 5's router
   * internals.
   */
  it('every documented path+method resolves to a real Express route (dynamic dispatch)', async () => {
    const phantomRoutes = [];

    for (const [method, pathTemplate] of ROUTE_INVENTORY) {
      const resolvedPath = pathTemplate.replace(/\{[^}]+\}/g, PLACEHOLDER_ID);
      const fullPath = `/api/v1${resolvedPath}`;

      const res = await request(app)[method.toLowerCase()](fullPath).send({});

      const isPhantom = res.status === 404 && typeof res.body?.message === 'string' && res.body.message.startsWith('Route not found:');
      if (isPhantom) phantomRoutes.push(`${method} ${fullPath} -> ${res.status} ${res.body?.message}`);
    }

    expect(phantomRoutes).toEqual([]);
  });
});

/**
 * V2.11B — closes the documentation gap noted in routeInventoryManifest.js
 * (the /api/v2/mobile/* Staff PIN kiosk workflow was, by design, outside
 * that /api/v1-only inventory). Same two-sided regression check as above,
 * scoped to the six genuinely new v2-only operations and dispatched
 * against /api/v2/mobile instead of /api/v1.
 */
describe('API inventory regression — Mobile V2 (Express routes vs. OpenAPI paths)', () => {
  it('documents every V2 mobile route in the manifest, and documents nothing extra', () => {
    const documented = new Set();
    Object.entries(openApiDocument.paths).forEach(([pathKey, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        if (typeof operation !== 'object' || !operation?.tags?.includes('Mobile API V2 (Staff PIN Kiosk)')) return;
        documented.add(`${method.toUpperCase()} ${pathKey}`);
      });
    });

    // OpenAPI keys for this module are the full absolute path (paths/mobileV2.js's
    // header comment explains why a short key would collide with an
    // unrelated /api/v1 admin resource) — build the manifest's comparison
    // keys the same way.
    const manifestKeys = new Set(
      ROUTE_INVENTORY_V2_MOBILE.map(([method, path]) => `${method} /api/v2/mobile${path}`),
    );

    const missingFromDocs = [...manifestKeys].filter((key) => !documented.has(key));
    const undocumentedExtras = [...documented].filter((key) => !manifestKeys.has(key));

    expect(missingFromDocs, 'V2 mobile routes that exist but are not documented in OpenAPI').toEqual([]);
    expect(undocumentedExtras, 'OpenAPI "Mobile API V2" paths that do not correspond to a real route').toEqual([]);
  });

  it('matches the current V2-only mobile endpoint count (V2.4 Staff PIN/session x3 + V2.6 service-types + V2.7 respondent-types + V2.4 attributed feedback)', () => {
    expect(ROUTE_INVENTORY_V2_MOBILE.length).toBe(6);
  });

  it('every documented V2 mobile path+method resolves to a real Express route (dynamic dispatch)', async () => {
    const phantomRoutes = [];

    for (const [method, pathTemplate] of ROUTE_INVENTORY_V2_MOBILE) {
      const fullPath = `/api/v2/mobile${pathTemplate}`;

      const res = await request(app)[method.toLowerCase()](fullPath).send({});

      const isPhantom = res.status === 404 && typeof res.body?.message === 'string' && res.body.message.startsWith('Route not found:');
      if (isPhantom) phantomRoutes.push(`${method} ${fullPath} -> ${res.status} ${res.body?.message}`);
    }

    expect(phantomRoutes).toEqual([]);
  });
});
