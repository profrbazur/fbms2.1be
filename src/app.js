import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import swaggerRouter from './docs/swaggerRouter.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// Serves locally-uploaded logo files (P8.0 — see middleware/uploadLogo.js).
// Local disk only, no cloud storage, per that phase's explicit Version 1
// scope. `crossOriginResourcePolicy: 'cross-origin'` above is required
// for the frontend (a different origin/port in development) to actually
// load these images — Helmet's default `same-origin` policy would
// otherwise silently block the <img> request.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// V2.1 — OpenAPI/Swagger. Mounted at the root, never under /api/v1 (this
// is documentation, not a versioned API resource). Gated by
// API_DOCS_ENABLED — see docs/swaggerRouter.js.
app.use(swaggerRouter);

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
