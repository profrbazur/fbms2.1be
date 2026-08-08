import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import OrganizationSettings from '../../src/models/OrganizationSettings.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const getSettings = (token) =>
  request(app)
    .get('/api/v1/organization')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const patchSettings = (token, body) =>
  request(app)
    .patch('/api/v1/organization')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/organization', () => {
  it('is retrievable by an authenticated Super Admin', async () => {
    const res = await getSettings(roles.superAdmin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.settings.universityName).toBeTruthy();
  });

  it('is retrievable by an authenticated Department Head', async () => {
    const res = await getSettings(roles.registrarHead.token);
    expect(res.status).toBe(200);
  });

  it('is retrievable by an authenticated Personnel user', async () => {
    const res = await getSettings(roles.registrarStaff.token);
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await getSettings();
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/organization', () => {
  it('allows Super Admin to update settings', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      contactPerson: 'Updated Administrator',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.contactPerson).toBe('Updated Administrator');
  });

  it('rejects a Department Head with 403', async () => {
    const res = await patchSettings(roles.registrarHead.token, {
      contactPerson: 'Should Not Apply',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user with 403', async () => {
    const res = await patchSettings(roles.registrarStaff.token, {
      contactPerson: 'Should Not Apply',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await patchSettings(undefined, { contactPerson: 'Nope' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid field value with 400', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('rejects an invalid hex color with 400', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      primaryColor: 'green',
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'primaryColor')).toBe(true);
  });

  it('rejects unknown fields and does not persist them', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      unexpectedField: 'hacker value',
    });

    expect(res.status).toBe(400);

    const settings = await OrganizationSettings.findOne();
    expect(settings.toObject()).not.toHaveProperty('unexpectedField');
  });

  it('maintains singleton behavior across repeated updates', async () => {
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Round 1' });
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Round 2' });
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Round 3' });

    expect(await OrganizationSettings.countDocuments()).toBe(1);

    const settings = await OrganizationSettings.findOne();
    expect(settings.contactPerson).toBe('Round 3');
  });

  it('accepts and persists a valid logoUrl', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      logoUrl: 'https://example.test/logo.png',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.logoUrl).toBe('https://example.test/logo.png');
  });

  it('accepts and persists mobileHeartbeatIntervalSeconds and mobileMinAppVersion (P5.1)', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      mobileHeartbeatIntervalSeconds: 120,
      mobileMinAppVersion: '1.2.0',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.mobileHeartbeatIntervalSeconds).toBe(120);
    expect(res.body.data.settings.mobileMinAppVersion).toBe('1.2.0');
  });

  it('rejects a mobileHeartbeatIntervalSeconds below the 30-second floor', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      mobileHeartbeatIntervalSeconds: 5,
    });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'mobileHeartbeatIntervalSeconds')).toBe(true);
  });

  it('rejects an empty mobileMinAppVersion', async () => {
    const res = await patchSettings(roles.superAdmin.token, { mobileMinAppVersion: '' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'mobileMinAppVersion')).toBe(true);
  });
});
