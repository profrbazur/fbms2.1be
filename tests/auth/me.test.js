import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import { env } from '../../src/config/env.js';
import { signAuthToken } from '../../src/utils/jwt.js';
import { resetAndSeed, DEFAULT_PASSWORD } from '../utils/seedTestUsers.js';
import { disconnectTestDb } from '../utils/testDb.js';

const me = (token) =>
  request(app)
    .get('/api/v1/auth/me')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

let validToken;
let seededUser;

beforeAll(async () => {
  await resetAndSeed();

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: 'registrar.head@fbms.test',
    password: DEFAULT_PASSWORD,
  });

  validToken = loginRes.body.data.token;
  seededUser = loginRes.body.data.user;
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/auth/me', () => {
  it('returns the sanitized current user for a valid token', async () => {
    const res = await me(validToken);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(seededUser.email);
    expect(res.body.data.user.role).toBe('department_head');
    expect(res.body.data.user.departmentId).toBe(seededUser.departmentId);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a missing token with 401', async () => {
    const res = await me();
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token with 401', async () => {
    const res = await me('not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects an expired token with 401', async () => {
    const expiredToken = jwt.sign(
      { sub: seededUser._id, role: seededUser.role, departmentId: seededUser.departmentId },
      env.jwtSecret,
      { expiresIn: -10 },
    );

    const res = await me(expiredToken);
    expect(res.status).toBe(401);
  });

  it('rejects a token for a user that no longer exists', async () => {
    const fakeUser = { _id: new mongoose.Types.ObjectId(), role: 'personnel', departmentId: null };
    const token = signAuthToken(fakeUser);

    const res = await me(token);
    expect(res.status).toBe(401);
  });

  it('rejects a token for a deactivated user', async () => {
    const user = await User.findOne({ email: 'library.staff3@fbms.test' });
    const token = signAuthToken(user);

    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });

    const res = await me(token);
    expect(res.status).toBe(401);

    await User.updateOne({ _id: user._id }, { $set: { isActive: true } });
  });
});
