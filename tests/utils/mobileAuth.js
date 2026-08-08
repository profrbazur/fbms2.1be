import request from 'supertest';
import app from '../../src/app.js';
import Tablet from '../../src/models/Tablet.js';

/**
 * Activates a seeded tablet by deviceCode through the real
 * POST /api/v1/mobile/activate endpoint (not a shortcut around it), so
 * every mobile test file exercises the same activation flow it's
 * ultimately relying on. Returns the one-time deviceSecret for use in
 * subsequent `Authorization: Device <secret>` requests.
 *
 * Always force-clears any prior activation state first — a test-fixture
 * convenience only (production has no such reset outside of an
 * administrator regenerating the tablet's token) so unrelated test
 * scenarios can each get a fresh activation of the same seeded tablet
 * without colliding on the real single-use constraint. The single-use
 * constraint itself is tested directly in
 * tests/mobile/activate.test.js, which calls the endpoint twice in a
 * row without this reset in between.
 */
export async function activateTabletByDeviceCode(deviceCode) {
  const tablet = await Tablet.findOne({ deviceCode });
  await Tablet.updateOne(
    { _id: tablet._id },
    { $set: { activationConsumedAt: null }, $unset: { deviceSecretHash: 1 } },
  );

  const activationResponse = await request(app)
    .post('/api/v1/mobile/activate')
    .send({ activationToken: tablet.activationToken });

  return {
    tabletId: tablet._id.toString(),
    deviceSecret: activationResponse.body.data?.deviceSecret,
    activationResponse,
  };
}

export function deviceAuthHeader(secret) {
  return secret ? { Authorization: `Device ${secret}` } : {};
}
