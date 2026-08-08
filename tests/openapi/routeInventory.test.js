import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { openApiDocument } from '../../src/docs/openapi/index.js';
import { ROUTE_INVENTORY } from './routeInventoryManifest.js';

const PLACEHOLDER_ID = '000000000000000000000000';

function toOpenApiKey([method, path]) {
  return `${method} ${path}`;
}

describe('API inventory regression (Express routes vs. OpenAPI paths)', () => {
  it('documents every route in the manifest, and documents nothing extra', () => {
    const documented = new Set();
    Object.entries(openApiDocument.paths).forEach(([pathKey, methods]) => {
      Object.keys(methods).forEach((method) => documented.add(`${method.toUpperCase()} ${pathKey}`));
    });

    const manifestKeys = new Set(ROUTE_INVENTORY.map(toOpenApiKey));

    const missingFromDocs = [...manifestKeys].filter((key) => !documented.has(key));
    const undocumentedExtras = [...documented].filter((key) => !manifestKeys.has(key));

    expect(missingFromDocs, 'routes that exist but are not documented in OpenAPI').toEqual([]);
    expect(undocumentedExtras, 'OpenAPI paths that do not correspond to a real route').toEqual([]);
  });

  it('matches the previously-frozen 53-endpoint count (Version 1 API freeze, ADR-051/ADR-052)', () => {
    expect(ROUTE_INVENTORY.length).toBe(53);
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
