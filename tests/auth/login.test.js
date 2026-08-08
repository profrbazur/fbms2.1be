import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import { resetAndSeed, DEFAULT_PASSWORD } from '../utils/seedTestUsers.js';
import { disconnectTestDb } from '../utils/testDb.js';

const login = (body) => request(app).post('/api/v1/auth/login').send(body);

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/auth/login', () => {
  it('logs in a seeded Super Admin', async () => {
    const res = await login({
      email: 'superadmin@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('super_admin');
    expect(res.body.data.user.departmentId).toBeNull();
  });

  it('logs in a seeded Department Head', async () => {
    const res = await login({
      email: 'registrar.head@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('department_head');
    expect(res.body.data.user.departmentId).toBeTruthy();
  });

  it('logs in a seeded Personnel user', async () => {
    const res = await login({
      email: 'library.staff1@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('personnel');
    expect(res.body.data.user.departmentId).toBeTruthy();
  });

  it('rejects a malformed email with 400', async () => {
    const res = await login({ email: 'not-an-email', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('email');
  });

  it('rejects a missing email with 400', async () => {
    const res = await login({ password: DEFAULT_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('rejects a missing password with 400', async () => {
    const res = await login({ email: 'superadmin@fbms.test' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('rejects an unknown email and a wrong password with the same message', async () => {
    const unknownEmailRes = await login({
      email: 'nobody@fbms.test',
      password: DEFAULT_PASSWORD,
    });
    const wrongPasswordRes = await login({
      email: 'superadmin@fbms.test',
      password: 'WrongPassword!',
    });

    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    // Enumeration-safety: both failure modes must be indistinguishable.
    expect(unknownEmailRes.body.message).toBe(wrongPasswordRes.body.message);
  });

  it('rejects a deactivated user with a distinct message, without touching other users', async () => {
    await User.updateOne(
      { email: 'library.staff2@fbms.test' },
      { $set: { isActive: false } },
    );

    const res = await login({
      email: 'library.staff2@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/i);

    // Restore so this test doesn't leak state into other test files.
    await User.updateOne(
      { email: 'library.staff2@fbms.test' },
      { $set: { isActive: true } },
    );
  });

  it('never includes passwordHash in the response', async () => {
    const res = await login({
      email: 'superadmin@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });

  it('returns a JWT with a future expiration', async () => {
    const res = await login({
      email: 'superadmin@fbms.test',
      password: DEFAULT_PASSWORD,
    });

    const { token } = res.body.data;
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = jwt.decode(token);
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
