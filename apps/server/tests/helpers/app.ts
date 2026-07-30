import request from 'supertest';
import type { Express } from 'express';
import type { Me } from '@collabboard/shared';
import { createApp } from '../../src/app';

/** Fresh Express app wired to the in-memory Mongo the setup file provisioned. */
export function makeApp(): Express {
  return createApp();
}

/** A supertest agent keeps a cookie jar, so the refresh-cookie flow works end-to-end. */
export type Agent = ReturnType<typeof request.agent>;

let seq = 0;
/** Collision-free email per call so parallel-ish registrations never 409 by accident. */
export function uniqueEmail(prefix = 'user'): string {
  seq += 1;
  return `${prefix}.${Date.now()}.${seq}@test.dev`;
}

/** Convenience: the Bearer header for an access token. */
export function bearer(accessToken: string): [string, string] {
  return ['Authorization', `Bearer ${accessToken}`];
}

export interface RegisteredUser {
  accessToken: string;
  user: Me;
  email: string;
  password: string;
}

/**
 * Register a brand-new user through the real REST surface and return the resulting
 * access token + profile. Uses the passed agent so its cookie jar holds the refresh
 * cookie for later `/auth/refresh` calls.
 */
export async function registerAndLogin(
  agent: Agent,
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<RegisteredUser> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? 'Password123!';
  const name = overrides.name ?? 'Test User';

  const res = await agent.post('/api/auth/register').send({ email, password, name }).expect(201);

  return { accessToken: res.body.accessToken, user: res.body.user, email, password };
}
