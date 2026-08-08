import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';

describe('Swagger/OpenAPI HTTP routes', () => {
  it('GET /openapi.json returns the machine-readable spec', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths).toBeTruthy();
  });

  it('GET /api-docs serves the Swagger UI HTML page', async () => {
    const res = await request(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('never exposes MONGO_URI, JWT_SECRET, or their values through the spec', async () => {
    const res = await request(app).get('/openapi.json');
    const raw = JSON.stringify(res.body);

    expect(raw).not.toMatch(/MONGO_URI/);
    expect(raw).not.toMatch(/JWT_SECRET/);
    expect(raw).not.toContain(env.jwtSecret);
    expect(raw).not.toContain(env.mongoUri);
  });

  it('does not bypass RBAC — /api/v1 routes still require their normal auth regardless of docs being enabled', async () => {
    const res = await request(app).get('/api/v1/audit-logs');
    expect(res.status).toBe(401);
  });

  it('leaves /api/v1 untouched — Swagger routes are mounted outside the versioned API namespace', async () => {
    const openapiUnderApi = await request(app).get('/api/v1/openapi.json');
    const docsUnderApi = await request(app).get('/api/v1/api-docs');

    expect(openapiUnderApi.status).toBe(404);
    expect(docsUnderApi.status).toBe(404);
  });
});
