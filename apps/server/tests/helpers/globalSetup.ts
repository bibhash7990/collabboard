import type { GlobalSetupContext } from 'vitest/node';

/**
 * Runs exactly once for the whole test run (before any worker spawns). Boots a
 * single in-memory MongoDB and hands its URI to the worker via `provide`, so the
 * suite is hermetic and every test file shares one server. The returned function
 * tears it down once, after everything has finished.
 */
let mongod: { stop: () => Promise<boolean> } | undefined;

export default async function setup({ provide }: GlobalSetupContext) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  mongod = server;
  provide('mongoUri', server.getUri());
  return async () => {
    await mongod?.stop();
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    mongoUri: string;
  }
}
