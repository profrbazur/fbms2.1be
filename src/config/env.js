import dotenv from 'dotenv';

dotenv.config();

const requiredVars = ['MONGO_URI', 'JWT_SECRET'];

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// CLIENT_URL only has a usable default (localhost) in development — in
// production a forgotten CLIENT_URL would silently misconfigure CORS
// against the real frontend origin (app.js's `cors({ origin: env.clientUrl
// })`), which fails closed but confusingly. Fail loudly at startup instead.
const missing = requiredVars.filter((key) => !process.env[key]);
if (isProduction && !process.env.CLIENT_URL) {
  missing.push('CLIENT_URL');
}

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}`,
  );
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // V2.1 — OpenAPI/Swagger. Docs visibility (apiDocsEnabled) defaults on in
  // every environment — set to 'false' to disable the /api-docs and
  // /openapi.json routes entirely, without touching application code.
  // Never affects /api/v1 itself.
  apiDocsEnabled: process.env.API_DOCS_ENABLED !== 'false',
  // The interactive "Try it out" executor calls the real API against real
  // data, so it's opt-out in development/test (enabled unless explicitly
  // 'false') but opt-IN in production (disabled unless explicitly 'true')
  // — a forgotten env var fails safe instead of leaving live execution on.
  apiDocsTryItOutEnabled: isProduction
    ? process.env.API_DOCS_TRY_IT_OUT_ENABLED === 'true'
    : process.env.API_DOCS_TRY_IT_OUT_ENABLED !== 'false',
};
