import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import Personnel from '../../src/models/Personnel.js';
import ServiceSession from '../../src/models/ServiceSession.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { activateTabletByDeviceCode, deviceAuthHeader } from '../utils/mobileAuth.js';
import { disconnectTestDb } from '../utils/testDb.js';

const staffLogin = (headers, body) =>
  request(app).post('/api/v2/mobile/staff/login').set(headers ?? {}).send(body ?? {});

const staffLogout = (headers) =>
  request(app).post('/api/v2/mobile/staff/logout').set(headers ?? {}).send();

const staffActive = (headers) =>
  request(app).get('/api/v2/mobile/staff/active').set(headers ?? {});

let regDeviceSecret;
let regTablet2DeviceSecret;
let libDeviceSecret;

beforeAll(async () => {
  await resetAndSeed();
  ({ deviceSecret: regDeviceSecret } = await activateTabletByDeviceCode('REG-TAB-01'));
  ({ deviceSecret: regTablet2DeviceSecret } = await activateTabletByDeviceCode('REG-TAB-02'));
  ({ deviceSecret: libDeviceSecret } = await activateTabletByDeviceCode('LIB-TAB-02'));
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v2/mobile/staff/login', () => {
  it('rejects an unauthenticated (non-device) request with 401', async () => {
    const res = await staffLogin(undefined, { pin: '111004' });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed PIN (not exactly 6 digits) with 400', async () => {
    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), { pin: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'pin')).toBe(true);
  });

  it('rejects an unknown field with 400', async () => {
    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), {
      pin: '111004',
      personnelId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'personnelId')).toBe(true);
  });

  it('rejects a wrong PIN with a generic 401 (no enumeration hint)', async () => {
    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), { pin: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid PIN.');
  });

  it("rejects a PIN that belongs to a different department's Personnel with the same generic 401", async () => {
    // 111005 is LIB-0001's seeded PIN; REG-TAB-02 belongs to Registrar.
    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), { pin: '111005' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid PIN.');
  });

  it("rejects an inactive Personnel's correct PIN", async () => {
    await Personnel.updateOne({ employeeNumber: 'REG-0004' }, { $set: { isActive: false } });

    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), { pin: '111004' });
    expect(res.status).toBe(401);

    await Personnel.updateOne({ employeeNumber: 'REG-0004' }, { $set: { isActive: true } });
  });

  it('starts a ServiceSession on a valid PIN, never echoing the PIN or pinHash', async () => {
    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), { pin: '111004' });

    expect(res.status).toBe(201);
    expect(res.body.data.serviceSession.status).toBe('active');
    expect(res.body.data.personnel.fullName).toContain('Bianca');
    expect(JSON.stringify(res.body)).not.toMatch(/111004/);
    expect(JSON.stringify(res.body)).not.toMatch(/"pinHash"/);

    const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });
    expect(res.body.data.serviceSession.tabletId).toBe(tablet._id.toString());
  });

  it('rejects a second login on an already-active tablet with 409', async () => {
    const res = await staffLogin(deviceAuthHeader(regTablet2DeviceSecret), { pin: '111003' });
    expect(res.status).toBe(409);
  });

  it('a different tablet is unaffected by another tablet already having an active session', async () => {
    const res = await staffLogin(deviceAuthHeader(regDeviceSecret), { pin: '111001' });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/v2/mobile/staff/active', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await staffActive(undefined);
    expect(res.status).toBe(401);
  });

  it('returns the active service session for a tablet with staff logged in', async () => {
    const res = await staffActive(deviceAuthHeader(regDeviceSecret));
    expect(res.status).toBe(200);
    expect(res.body.data.serviceSession).toBeTruthy();
    expect(res.body.data.serviceSession.status).toBe('active');
  });

  it('returns null (not an error) for an idle tablet', async () => {
    const res = await staffActive(deviceAuthHeader(libDeviceSecret));
    expect(res.status).toBe(200);
    expect(res.body.data.serviceSession).toBeNull();
  });
});

describe('POST /api/v2/mobile/staff/logout', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await staffLogout(undefined);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the tablet has no active session', async () => {
    const res = await staffLogout(deviceAuthHeader(libDeviceSecret));
    expect(res.status).toBe(404);
  });

  it('ends the active session on a valid logout', async () => {
    const res = await staffLogout(deviceAuthHeader(regDeviceSecret));
    expect(res.status).toBe(200);
    expect(res.body.data.serviceSession.status).toBe('ended');
    expect(res.body.data.serviceSession.endedAt).toBeTruthy();

    const activeCheck = await staffActive(deviceAuthHeader(regDeviceSecret));
    expect(activeCheck.body.data.serviceSession).toBeNull();
  });

  it('logging out twice in a row returns 404 on the second attempt', async () => {
    const res = await staffLogout(deviceAuthHeader(regDeviceSecret));
    expect(res.status).toBe(404);
  });

  it('a tablet can accept a new staff login again after logout (session history accumulates)', async () => {
    const before = await ServiceSession.countDocuments({});
    const res = await staffLogin(deviceAuthHeader(regDeviceSecret), { pin: '111002' });
    expect(res.status).toBe(201);
    expect(await ServiceSession.countDocuments({})).toBe(before + 1);
  });
});
