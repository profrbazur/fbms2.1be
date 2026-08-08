import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';

async function startServer() {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`FBMS API listening on port ${env.port} (${env.nodeEnv}).`);
  });
}

startServer();
