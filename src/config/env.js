import dotenv from 'dotenv';

dotenv.config();

const requiredVars = ['MONGO_URI', 'JWT_SECRET'];

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}`,
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // V2.1 — OpenAPI/Swagger. Both default enabled (teaching environment);
  // set to 'false' in a turnover/production environment to disable the
  // docs routes entirely, or just the interactive "Try it out" executor,
  // without touching application code. Never affects /api/v1 itself.
  apiDocsEnabled: process.env.API_DOCS_ENABLED !== 'false',
  apiDocsTryItOutEnabled: process.env.API_DOCS_TRY_IT_OUT_ENABLED !== 'false',
};
