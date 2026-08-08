import dotenv from 'dotenv';
import path from 'node:path';

process.env.NODE_ENV = 'test';

// override:true so a real backend/.env (dev credentials) loaded earlier in
// the process can never win over the dedicated test config.
dotenv.config({
  path: path.resolve(process.cwd(), '.env.test'),
  override: true,
});

/**
 * Hard safety net: refuse to run any test at all unless MONGO_URI is
 * unambiguously a test database. This is the last line of defense
 * against ever touching the development database (feedback_management_db)
 * from an automated test run — see docs/DECISIONS.md.
 */
const DEV_DB_NAME = 'feedback_management_db';
const mongoUri = process.env.MONGO_URI ?? '';
const dbNameMatch = mongoUri.match(/\/([^/?]+)(\?|$)/);
const dbName = dbNameMatch?.[1];

if (!dbName || !dbName.toLowerCase().includes('test') || dbName === DEV_DB_NAME) {
  throw new Error(
    'Refusing to run tests: MONGO_URI does not resolve to a database whose ' +
      `name contains "test" (resolved name: "${dbName ?? '(none)'}"). ` +
      'Populate backend/.env.test with a dedicated test database before running tests.',
  );
}
