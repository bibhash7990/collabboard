import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Redis is optional: with no REDIS_URL the app runs single-node (no adapter,
 * no cross-node pub/sub). This keeps local dev and tests dependency-light while
 * still exercising the same code paths.
 */
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

export function redisEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

export function getRedisClients(): { pub: Redis; sub: Redis } | null {
  if (!env.REDIS_URL) return null;
  if (!pubClient) {
    pubClient = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: null });
    subClient = pubClient.duplicate();
    pubClient.on('error', (err) => logger.error({ err }, 'Redis pub error'));
    subClient.on('error', (err) => logger.error({ err }, 'Redis sub error'));
    logger.info('Redis clients initialized');
  }
  return { pub: pubClient, sub: subClient! };
}

export async function closeRedis(): Promise<void> {
  await Promise.all([pubClient?.quit(), subClient?.quit()].filter(Boolean));
  pubClient = null;
  subClient = null;
}
