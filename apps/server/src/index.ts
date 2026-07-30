import http from 'node:http';
import { createApp } from './app';
import { createSocketServer } from './realtime/gateway';
import { connectDb, disconnectDb } from './config/db';
import { closeRedis } from './config/redis';
import { boardDocs } from './realtime/manager';
import { env } from './config/env';
import { logger } from './config/logger';

async function main(): Promise<void> {
  await connectDb();

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  server.listen(env.PORT, () => {
    logger.info(`🚀 CollabBoard server on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down…');
    server.close();
    await boardDocs.flushAll().catch(() => undefined);
    await disconnectDb().catch(() => undefined);
    await closeRedis().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
