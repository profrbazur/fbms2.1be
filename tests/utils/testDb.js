import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';

export async function connectTestDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.mongoUri);
  }
}

export async function disconnectTestDb() {
  await mongoose.disconnect();
}

export async function clearCollections(...models) {
  await Promise.all(models.map((model) => model.deleteMany({})));
}
