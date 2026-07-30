import { pino } from 'pino';
import { env, isProd, isTest } from './env';

export const logger = pino({
  // LOG_LEVEL always wins (handy for surfacing errors in otherwise-silent tests).
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
  base: { service: 'collabboard-server', env: env.NODE_ENV },
});
