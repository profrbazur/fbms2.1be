import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';

async function startServer() {
  await connectDatabase();

  const server = app.listen(env.port, () => {
    console.log(`FBMS API listening on port ${env.port} (${env.nodeEnv}).`);
  });

  // Render (and most orchestrators) send SIGTERM on redeploy/restart —
  // without this the process dies immediately, cutting off in-flight
  // requests and leaving the Mongoose socket closed uncleanly.
  const shutdown = (signal) => {
    console.log(`${signal} received: shutting down gracefully.`);
    server.close(async () => {
      await mongoose.connection.close();
      console.log('HTTP server and MongoDB connection closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
