import { describe, it, expect } from 'vitest';
import { openApiDocument } from '../../src/docs/openapi/index.js';
import { systemPaths } from '../../src/docs/openapi/paths/system.js';
import { authPaths } from '../../src/docs/openapi/paths/auth.js';
import { organizationPaths } from '../../src/docs/openapi/paths/organization.js';
import { departmentsPaths } from '../../src/docs/openapi/paths/departments.js';
import { buildingsPaths } from '../../src/docs/openapi/paths/buildings.js';
import { locationsPaths } from '../../src/docs/openapi/paths/locations.js';
import { personnelPaths } from '../../src/docs/openapi/paths/personnel.js';
import { tabletsPaths } from '../../src/docs/openapi/paths/tablets.js';
import { surveysPaths } from '../../src/docs/openapi/paths/surveys.js';
import { feedbackPaths } from '../../src/docs/openapi/paths/feedback.js';
import { dashboardPaths } from '../../src/docs/openapi/paths/dashboard.js';
import { reportsPaths } from '../../src/docs/openapi/paths/reports.js';
import { liveMonitoringPaths } from '../../src/docs/openapi/paths/liveMonitoring.js';
import { settingsPaths } from '../../src/docs/openapi/paths/settings.js';
import { auditLogsPaths } from '../../src/docs/openapi/paths/auditLogs.js';
import { developerPortalPaths } from '../../src/docs/openapi/paths/developerPortal.js';
import { mobilePaths } from '../../src/docs/openapi/paths/mobile.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
const pathModules = [
  systemPaths,
  authPaths,
  organizationPaths,
  departmentsPaths,
  buildingsPaths,
  locationsPaths,
  personnelPaths,
  tabletsPaths,
  surveysPaths,
  feedbackPaths,
  dashboardPaths,
  reportsPaths,
  liveMonitoringPaths,
  settingsPaths,
  auditLogsPaths,
  developerPortalPaths,
  mobilePaths,
];

function collectOperations(paths) {
  const operations = [];
  Object.entries(paths).forEach(([pathKey, methods]) => {
    Object.entries(methods).forEach(([method, operation]) => {
      if (HTTP_METHODS.includes(method)) operations.push({ pathKey, method, operation });
    });
  });
  return operations;
}

describe('OpenAPI document structure', () => {
  it('declares a valid OpenAPI 3.x version', () => {
    expect(openApiDocument.openapi).toMatch(/^3\.\d+\.\d+$/);
  });

  it('has info, servers, tags, and components', () => {
    expect(openApiDocument.info?.title).toBe('FBMS API');
    expect(Array.isArray(openApiDocument.servers)).toBe(true);
    expect(openApiDocument.servers.length).toBeGreaterThan(0);
    expect(Array.isArray(openApiDocument.tags)).toBe(true);
    expect(openApiDocument.components).toBeTruthy();
  });

  it('declares both security schemes actually used by the API', () => {
    expect(openApiDocument.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(openApiDocument.components.securitySchemes.deviceAuth).toMatchObject({ type: 'apiKey', name: 'Authorization' });
  });

  it('defines every major model/envelope schema', () => {
    const expectedSchemas = [
      'ErrorResponse',
      'ValidationErrorItem',
      'Pagination',
      'User',
      'Department',
      'Building',
      'Location',
      'Personnel',
      'Tablet',
      'MonitoredTablet',
      'Survey',
      'Question',
      'FeedbackSession',
      'FeedbackAnswer',
      'OrganizationSettings',
      'AuditLog',
      'DashboardSummary',
      'ReportsSummary',
      'LiveMonitoringSummary',
      'HealthResponse',
      'MobileConfig',
    ];
    expectedSchemas.forEach((name) => {
      expect(openApiDocument.components.schemas[name], `missing schema ${name}`).toBeTruthy();
    });
  });

  it('never exposes passwordHash or deviceSecretHash as an actual schema property', () => {
    // Matches only a JSON property key (e.g. "passwordHash":), not the word
    // appearing in prose (e.g. a schema description noting the field is
    // excluded) — the latter is expected and desirable documentation.
    const json = JSON.stringify(openApiDocument.components.schemas);
    expect(json).not.toMatch(/"passwordHash":/);
    expect(json).not.toMatch(/"deviceSecretHash":/);
  });

  it('merges every path module with no silently-overwritten duplicate keys', () => {
    const expectedTotal = pathModules.reduce((sum, mod) => sum + Object.keys(mod).length, 0);
    expect(Object.keys(openApiDocument.paths).length).toBe(expectedTotal);
  });

  it('has no duplicate method+path definition within any single path entry', () => {
    const seen = new Set();
    collectOperations(openApiDocument.paths).forEach(({ pathKey, method }) => {
      const key = `${method.toUpperCase()} ${pathKey}`;
      expect(seen.has(key), `duplicate operation ${key}`).toBe(false);
      seen.add(key);
    });
  });

  it('assigns a unique operationId to every operation', () => {
    const operationIds = collectOperations(openApiDocument.paths).map(({ operation }) => operation.operationId);
    operationIds.forEach((id) => expect(id, 'operation missing operationId').toBeTruthy());
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it('gives every operation a summary, tag, and at least one documented response', () => {
    collectOperations(openApiDocument.paths).forEach(({ pathKey, method, operation }) => {
      const label = `${method.toUpperCase()} ${pathKey}`;
      expect(operation.summary, `${label} missing summary`).toBeTruthy();
      expect(operation.tags?.length, `${label} missing tags`).toBeGreaterThan(0);
      expect(Object.keys(operation.responses ?? {}).length, `${label} missing responses`).toBeGreaterThan(0);
    });
  });

  it('every operation declares its own security (no operation silently relies on the top-level default)', () => {
    collectOperations(openApiDocument.paths).forEach(({ pathKey, method, operation }) => {
      expect(operation.security, `${method.toUpperCase()} ${pathKey} missing explicit security`).toBeDefined();
    });
  });
});
