import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { apiLimiter } from './middleware/rateLimit';
import { notFound, errorHandler } from './middleware/error';

/** Build the Express app (no listening) — reused directly by integration tests. */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '6mb' })); // thumbnails / snapshots
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'collabboard-server', ts: new Date().toISOString() });
  });

  app.use('/api', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
