import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';
import { resetAndSeed } from '../utils/seedTestUsers.js';
import { loginAllSeededRoles } from '../utils/authTokens.js';
import { disconnectTestDb } from '../utils/testDb.js';

const activate = (body) => request(app).post('/api/v1/mobile/activate').send(body ?? {});

let roles;

beforeAll(async () => {
  await resetAndSeed();
  roles = await loginAllSeededRoles();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('POST /api/v1/mobile/activate', () => {
  it('rejects a missing activationToken with 400', async () => {
    const res = await activate({});
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'activationToken')).toBe(true);
  });

  it('rejects an unknown field with 400', async () => {
    const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await activate({ activationToken: tablet.activationToken, departmentId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'departmentId')).toBe(true);
  });

  it('rejects a nonexistent activation token with 401', async () => {
    const res = await activate({ activationToken: 'TAB-DOESNOTEXIST' });
    expect(res.status).toBe(401);
  });

  it('rejects a correct token for a deactivated tablet with 403', async () => {
    const tablet = await Tablet.findOne({ deviceCode: 'LIB-TAB-02' });
    await request(app)
      .patch(`/api/v1/tablets/${tablet._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ isActive: false });

    const res = await activate({ activationToken: tablet.activationToken });
    expect(res.status).toBe(403);

    // restore for any later test relying on this tablet being active
    await request(app)
      .patch(`/api/v1/tablets/${tablet._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` })
      .send({ isActive: true });
  });

  it('activates successfully, returning a deviceSecret exactly once', async () => {
    const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await activate({ activationToken: tablet.activationToken });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.deviceSecret).toBe('string');
    expect(res.body.data.deviceSecret.length).toBeGreaterThan(20);
    expect(res.body.data.tablet).toEqual({ deviceCode: 'REG-TAB-01', deviceName: tablet.deviceName });

    const persisted = await Tablet.findById(tablet._id).select('+deviceSecretHash');
    expect(persisted.deviceSecretHash).toBeTruthy();
    expect(persisted.activationConsumedAt).toBeInstanceOf(Date);
  });

  it('never exposes deviceSecretHash through the admin Tablet API', async () => {
    const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-01' });
    const res = await request(app)
      .get(`/api/v1/tablets/${tablet._id.toString()}`)
      .set({ Authorization: `Bearer ${roles.superAdmin.token}` });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/deviceSecretHash/i);
  });

  describe('single-use activation / replay protection', () => {
    it('rejects reusing an already-consumed activation token with the same generic message', async () => {
      // REG-TAB-02 — not yet activated by any earlier test in this file.
      const tablet = await Tablet.findOne({ deviceCode: 'REG-TAB-02' });

      const first = await activate({ activationToken: tablet.activationToken });
      expect(first.status).toBe(201);

      const replay = await activate({ activationToken: tablet.activationToken });
      expect(replay.status).toBe(401);

      const unknownTokenAttempt = await activate({ activationToken: 'TAB-UNKNOWN1' });
      expect(unknownTokenAttempt.body.message).toBe(replay.body.message);
    });

    it('replaying the same consumed token repeatedly always fails, never re-issuing a Device Secret', async () => {
      // LIB-TAB-01 — not yet activated by any earlier test in this file.
      const tablet = await Tablet.findOne({ deviceCode: 'LIB-TAB-01' });

      await activate({ activationToken: tablet.activationToken });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const replay = await activate({ activationToken: tablet.activationToken });
        expect(replay.status).toBe(401);
        expect(replay.body.success).toBe(false);
      }
    });
  });
});
