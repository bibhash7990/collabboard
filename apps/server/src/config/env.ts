import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the nearest .env walking up from the cwd, so it's found whether the process
// runs from the repo root or a workspace dir (npm sets cwd to apps/server). In a
// container no .env exists → env comes from the platform, which is exactly right.
function findEnvFile(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
const envPath = findEnvFile(process.cwd());
dotenv.config(envPath ? { path: envPath } : undefined);

/**
 * Validated, typed environment. The process refuses to boot with a bad config
 * rather than failing mysteriously at the first request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  MONGO_URI: z.string().default('mongodb://localhost:27017/collabboard'),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please-0000'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-please-000'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  COOKIE_NAME: z.string().default('cb_refresh'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // 'lax' for same-origin (frontend served by this server); 'none' if the frontend
  // is on a different domain (requires COOKIE_SECURE=true + HTTPS).
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  EMAIL_FROM: z.string().default('CollabBoard <no-reply@collabboard.dev>'),
  // Resend HTTP API (preferred — works on Render free tier, no SMTP port restrictions)
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  // Legacy SMTP fallback (only works when the host allows outbound SMTP ports)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  AI_SERVICE_URL: z.string().optional(),
  SHARE_LINK_SECRET: z.string().default('dev-share-secret-change-me'),

  // When set, the server also serves the built web app from this directory
  // (single-origin production deploy). Unset in local dev (Vite serves the SPA).
  WEB_DIST: z.string().optional(),

  // Comma-separated DNS servers (e.g. "8.8.8.8,1.1.1.1") for networks whose default
  // resolver can't perform the SRV lookup that mongodb+srv:// requires.
  DNS_SERVERS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
