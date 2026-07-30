import { afterAll, afterEach, beforeAll, inject } from 'vitest';

/**
 * Per-worker setup. The in-memory Mongo is owned by globalSetup.ts; here we just
 * point the app's config at its URI (set BEFORE importing config/env, which
 * snapshots process.env), connect once, and wipe collections between tests.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
// Never touch a real Redis / AI service from tests → exercise the single-node paths.
delete process.env.REDIS_URL;
delete process.env.AI_SERVICE_URL;

const mongoUri = inject('mongoUri');
process.env.MONGO_URI = mongoUri;

// Imported only now, so config/env sees the URI we just set.
const { connectDb, disconnectDb } = await import('../../src/config/db');
const mongoose = (await import('mongoose')).default;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await connectDb(mongoUri);
});

afterEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDb();
});
