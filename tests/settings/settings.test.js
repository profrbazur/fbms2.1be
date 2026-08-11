import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import app from '../../src/app.js';
import OrganizationSettings from '../../src/models/OrganizationSettings.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';
import { LOGO_UPLOAD_DIR } from '../../src/middleware/uploadLogo.js';

// A minimal, genuinely valid 1x1 transparent PNG — real image bytes, not
// a renamed text file, so fileFilter's mimetype/extension checks and any
// future real image-decoding step would both accept it.
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const getSettings = (token) =>
  request(app)
    .get('/api/v1/settings')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

const patchSettings = (token, body) =>
  request(app)
    .patch('/api/v1/settings')
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send(body);

const uploadLogoAs = (token, { buffer, filename, mimeType } = {}) => {
  const req = request(app)
    .post('/api/v1/settings/logo')
    .set(token ? { Authorization: `Bearer ${token}` } : {});

  if (buffer !== undefined) {
    return req.attach('logo', buffer, { filename: filename ?? 'logo.png', contentType: mimeType });
  }
  return req;
};

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('GET /api/v1/settings', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await getSettings();
    expect(res.status).toBe(401);
  });

  it('is retrievable by Super Admin, Department Head, and Personnel alike', async () => {
    for (const role of [roles.superAdmin, roles.registrarHead, roles.registrarStaff]) {
      const res = await getSettings(role.token);
      expect(res.status).toBe(200);
      expect(res.body.data.settings.universityName).toBeTruthy();
    }
  });

  it('returns exactly one settings record, including every P8.0 field', async () => {
    const res = await getSettings(roles.superAdmin.token);
    const { settings } = res.body.data;

    expect(await OrganizationSettings.countDocuments()).toBe(1);
    expect(settings).toMatchObject({
      mobileHeartbeatIntervalSeconds: 300,
      feedbackSessionTimeoutSeconds: 120,
      defaultTrendWindowDays: 7,
      defaultPaginationSize: 20,
      timezone: 'Asia/Manila',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '12h',
      defaultSatisfactionTarget: 4,
    });
  });
});

describe('PATCH /api/v1/settings', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await patchSettings(undefined, { contactPerson: 'Nope' });
    expect(res.status).toBe(401);
  });

  it('rejects a Department Head with 403', async () => {
    const res = await patchSettings(roles.registrarHead.token, { contactPerson: 'Should Not Apply' });
    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user with 403', async () => {
    const res = await patchSettings(roles.registrarStaff.token, { contactPerson: 'Should Not Apply' });
    expect(res.status).toBe(403);
  });

  it('allows Super Admin to update Institution fields', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      universityName: 'Updated University',
      contactPerson: 'Updated Administrator',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.universityName).toBe('Updated University');
    expect(res.body.data.settings.contactPerson).toBe('Updated Administrator');
  });

  it('allows Super Admin to update Branding colors', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      primaryColor: '#123456',
      secondaryColor: '#abcdef',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.primaryColor).toBe('#123456');
    expect(res.body.data.settings.secondaryColor).toBe('#abcdef');
  });

  it('allows Super Admin to update Operational settings', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      mobileHeartbeatIntervalSeconds: 180,
      feedbackSessionTimeoutSeconds: 90,
      defaultTrendWindowDays: 30,
      defaultPaginationSize: 50,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings).toMatchObject({
      mobileHeartbeatIntervalSeconds: 180,
      feedbackSessionTimeoutSeconds: 90,
      defaultTrendWindowDays: 30,
      defaultPaginationSize: 50,
    });

    // restore for later tests
    await patchSettings(roles.superAdmin.token, {
      mobileHeartbeatIntervalSeconds: 300,
      feedbackSessionTimeoutSeconds: 120,
      defaultTrendWindowDays: 7,
      defaultPaginationSize: 20,
    });
  });

  it('allows Super Admin to update General display settings', async () => {
    const res = await patchSettings(roles.superAdmin.token, {
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '24h',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings).toMatchObject({
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '24h',
    });

    await patchSettings(roles.superAdmin.token, {
      timezone: 'Asia/Manila',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '12h',
    });
  });

  it('maintains singleton behavior across repeated updates', async () => {
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Round 1' });
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Round 2' });
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Round 3' });

    expect(await OrganizationSettings.countDocuments()).toBe(1);
    const settings = await OrganizationSettings.findOne();
    expect(settings.contactPerson).toBe('Round 3');
  });

  it('rejects unknown fields and does not persist them', async () => {
    const res = await patchSettings(roles.superAdmin.token, { unexpectedField: 'hacker value' });

    expect(res.status).toBe(400);
    const settings = await OrganizationSettings.findOne();
    expect(settings.toObject()).not.toHaveProperty('unexpectedField');
  });

  it('rejects logoUrl (write-only via the dedicated upload endpoint)', async () => {
    const res = await patchSettings(roles.superAdmin.token, { logoUrl: 'https://example.test/logo.png' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'logoUrl')).toBe(true);
  });

  it('rejects an empty body', async () => {
    const res = await patchSettings(roles.superAdmin.token, {});
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const res = await patchSettings(roles.superAdmin.token, { email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('rejects an invalid hex color', async () => {
    const res = await patchSettings(roles.superAdmin.token, { primaryColor: 'green' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'primaryColor')).toBe(true);
  });

  it('rejects mobileHeartbeatIntervalSeconds below the 30-second floor', async () => {
    const res = await patchSettings(roles.superAdmin.token, { mobileHeartbeatIntervalSeconds: 5 });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'mobileHeartbeatIntervalSeconds')).toBe(true);
  });

  it('rejects feedbackSessionTimeoutSeconds outside its bounds', async () => {
    const tooLow = await patchSettings(roles.superAdmin.token, { feedbackSessionTimeoutSeconds: 5 });
    expect(tooLow.status).toBe(400);

    const tooHigh = await patchSettings(roles.superAdmin.token, { feedbackSessionTimeoutSeconds: 9999 });
    expect(tooHigh.status).toBe(400);
  });

  it('rejects a defaultTrendWindowDays value outside [7, 30]', async () => {
    const res = await patchSettings(roles.superAdmin.token, { defaultTrendWindowDays: 14 });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'defaultTrendWindowDays')).toBe(true);
  });

  it('rejects a non-integer or out-of-range defaultPaginationSize', async () => {
    const nonInteger = await patchSettings(roles.superAdmin.token, { defaultPaginationSize: 20.5 });
    expect(nonInteger.status).toBe(400);

    const tooHigh = await patchSettings(roles.superAdmin.token, { defaultPaginationSize: 500 });
    expect(tooHigh.status).toBe(400);
  });

  it('rejects an invalid timezone identifier', async () => {
    const res = await patchSettings(roles.superAdmin.token, { timezone: 'Not/AZone' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'timezone')).toBe(true);
  });

  it('rejects an invalid dateFormat/timeFormat', async () => {
    const badDate = await patchSettings(roles.superAdmin.token, { dateFormat: 'DD-MM-YY' });
    expect(badDate.status).toBe(400);

    const badTime = await patchSettings(roles.superAdmin.token, { timeFormat: '25h' });
    expect(badTime.status).toBe(400);
  });

  describe('defaultSatisfactionTarget (V2.8)', () => {
    it('allows Super Admin to update it within the 1-5 rating scale', async () => {
      const res = await patchSettings(roles.superAdmin.token, { defaultSatisfactionTarget: 4.2 });

      expect(res.status).toBe(200);
      expect(res.body.data.settings.defaultSatisfactionTarget).toBe(4.2);

      await patchSettings(roles.superAdmin.token, { defaultSatisfactionTarget: 4 });
    });

    it('rejects a value outside [1, 5]', async () => {
      const tooLow = await patchSettings(roles.superAdmin.token, { defaultSatisfactionTarget: 0.5 });
      expect(tooLow.status).toBe(400);
      expect(tooLow.body.errors.some((e) => e.field === 'defaultSatisfactionTarget')).toBe(true);

      const tooHigh = await patchSettings(roles.superAdmin.token, { defaultSatisfactionTarget: 5.5 });
      expect(tooHigh.status).toBe(400);
    });
  });
});

describe('POST /api/v1/settings/logo', () => {
  afterAll(async () => {
    // Clean up any real files this suite wrote to local disk.
    const settings = await OrganizationSettings.findOne();
    if (settings?.logoUrl?.startsWith('/uploads/logos/')) {
      const filePath = path.join(LOGO_UPLOAD_DIR, path.basename(settings.logoUrl));
      fs.rm(filePath, { force: true }, () => {});
    }
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await uploadLogoAs(undefined, { buffer: TINY_PNG_BUFFER, mimeType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('rejects a Department Head with 403', async () => {
    const res = await uploadLogoAs(roles.registrarHead.token, { buffer: TINY_PNG_BUFFER, mimeType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('rejects a Personnel user with 403', async () => {
    const res = await uploadLogoAs(roles.registrarStaff.token, { buffer: TINY_PNG_BUFFER, mimeType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no file attached', async () => {
    const res = await uploadLogoAs(roles.superAdmin.token, {});
    expect(res.status).toBe(400);
  });

  it('rejects a non-image file (e.g. a renamed .txt)', async () => {
    const res = await uploadLogoAs(roles.superAdmin.token, {
      buffer: Buffer.from('not an image'),
      filename: 'logo.txt',
      mimeType: 'text/plain',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a file exceeding the 2MB size limit', async () => {
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
    const res = await uploadLogoAs(roles.superAdmin.token, {
      buffer: oversized,
      filename: 'huge.png',
      mimeType: 'image/png',
    });

    expect(res.status).toBe(400);
  });

  it('accepts a valid PNG, persists metadata, and serves the file statically', async () => {
    const res = await uploadLogoAs(roles.superAdmin.token, {
      buffer: TINY_PNG_BUFFER,
      filename: 'benilde-logo.png',
      mimeType: 'image/png',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.logoUrl).toMatch(/^\/uploads\/logos\/logo-.+\.png$/);
    expect(res.body.data.settings.logoOriginalName).toBe('benilde-logo.png');
    expect(res.body.data.settings.logoUploadedAt).toBeTruthy();

    const filePath = path.join(LOGO_UPLOAD_DIR, path.basename(res.body.data.settings.logoUrl));
    expect(fs.existsSync(filePath)).toBe(true);

    const staticRes = await request(app).get(res.body.data.settings.logoUrl);
    expect(staticRes.status).toBe(200);
  });

  it('replaces the previous logo metadata (and file) on a second upload', async () => {
    const first = await uploadLogoAs(roles.superAdmin.token, {
      buffer: TINY_PNG_BUFFER,
      filename: 'first.png',
      mimeType: 'image/png',
    });
    const firstPath = path.join(LOGO_UPLOAD_DIR, path.basename(first.body.data.settings.logoUrl));

    const second = await uploadLogoAs(roles.superAdmin.token, {
      buffer: TINY_PNG_BUFFER,
      filename: 'second.png',
      mimeType: 'image/png',
    });

    expect(second.body.data.settings.logoUrl).not.toBe(first.body.data.settings.logoUrl);
    expect(second.body.data.settings.logoOriginalName).toBe('second.png');
    expect(await OrganizationSettings.countDocuments()).toBe(1);

    // best-effort cleanup is async; give it a tick before asserting
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fs.existsSync(firstPath)).toBe(false);
  });
});

describe('Seeder idempotency', () => {
  it('re-running resetAndSeed never produces more than one settings record', async () => {
    await patchSettings(roles.superAdmin.token, { contactPerson: 'Pre-Reseed Value' });
    await resetAndSeed();

    expect(await OrganizationSettings.countDocuments()).toBe(1);
    // resetAndSeed clears the collection first, so this is a fresh
    // default-seeded record, not a preserved edit — consistent with
    // every other reset-between-test-files convention in this suite.
    const settings = await OrganizationSettings.findOne();
    expect(settings.contactPerson).toBe('FBMS Administrator');
  });
});
