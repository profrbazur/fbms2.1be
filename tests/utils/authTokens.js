import request from 'supertest';
import app from '../../src/app.js';
import { DEFAULT_PASSWORD } from '../../src/seeders/userSeeder.js';

async function loginAs(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: DEFAULT_PASSWORD });

  return { token: res.body.data.token, user: res.body.data.user };
}

/**
 * Logs in one of each seeded role so test files don't repeat the same
 * four login calls. Returns the token + sanitized user for each.
 */
export async function loginAllSeededRoles() {
  const [superAdmin, registrarHead, libraryHead, registrarStaff, libraryStaff] =
    await Promise.all([
      loginAs('superadmin@fbms.test'),
      loginAs('registrar.head@fbms.test'),
      loginAs('library.head@fbms.test'),
      loginAs('registrar.staff1@fbms.test'),
      loginAs('library.staff1@fbms.test'),
    ]);

  return { superAdmin, registrarHead, libraryHead, registrarStaff, libraryStaff };
}

export { loginAs };
