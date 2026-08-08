import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env.js';
import { openApiDocument } from './openapi/index.js';

/**
 * Mounted at the application root (never under /api/v1 — this is
 * documentation, not a versioned API resource) as:
 *   GET /openapi.json  — the machine-readable spec (Postman import, etc.)
 *   GET /api-docs       — Swagger UI
 *
 * Both routes are gated by API_DOCS_ENABLED (default enabled) so a
 * turnover/production deployment can disable documentation entirely
 * without touching application code. When enabled but
 * API_DOCS_TRY_IT_OUT_ENABLED=false, Swagger UI still renders every
 * endpoint but the "Try it out" executor is disabled — Swagger always
 * calls the real API, never a mock, so this is the safety switch for an
 * environment where interactive execution against real data is
 * undesirable (docs/DEVELOPMENT_ENVIRONMENT.md's staging-safety rules).
 */
const router = Router();

if (env.apiDocsEnabled) {
  router.get('/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  const swaggerUiOptions = {
    customSiteTitle: 'FBMS API Explorer',
    swaggerOptions: {
      persistAuthorization: true,
      ...(env.apiDocsTryItOutEnabled ? {} : { supportedSubmitMethods: [] }),
    },
  };

  // app.js's global helmet() leaves the default Content-Security-Policy
  // active app-wide (correctly — /api/v1 is JSON-only and needs no
  // relaxation). Swagger UI's HTML page bootstraps itself via an inline
  // <script>, which that default CSP blocks. Scoped narrowly to this one
  // subtree (never touching /api/v1 or any other route) rather than
  // loosening the app-wide helmet config — the smallest change that makes
  // Swagger UI render without weakening security anywhere else.
  router.use(
    '/api-docs',
    helmet.contentSecurityPolicy({
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, swaggerUiOptions),
  );
}

export default router;
