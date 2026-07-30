import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Test bootstrap. Provisions ONE in-memory MongoDB for the whole run and points
 * the app's config at it (set BEFORE importing config/env, which snapshots
 * process.env), then wipes collections between tests.
 *
 * The server is guarded on `globalThis` so it is created exactly once even though
 * this file is evaluated per test file in the single-fork worker, and it is
 * deliberately never `.stop()`-ed here (mongodb-memory-server cleans up its child
 * on process exit) — so an early `afterAll` can't tear the DB out from under a
 * later file. This works identically for `npm test` and `vitest run <one-file>`.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
// Never touch a real Redis / AI service from tests → exercise the single-node paths.
delete process.env.REDIS_URL;
delete process.env.AI_SERVICE_URL;

interface TestGlobals {
  __cbMongoUri?: string;
  __cbMongod?: { stop: () => Promise<boolean> };
}
const g = globalThis as unknown as TestGlobals;
if (!g.__cbMongoUri) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  g.__cbMongod = server;
  g.__cbMongoUri = server.getUri();
}
process.env.MONGO_URI = g.__cbMongoUri;

// Imported only now, so config/env sees the URI we just set.
const { connectDb, disconnectDb } = await import('../../src/config/db');
const mongoose = (await import('mongoose')).default;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await connectDb(g.__cbMongoUri!);
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
