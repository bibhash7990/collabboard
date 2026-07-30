import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { EmailToken, User } from '../src/models';
import { randomToken, sha256 } from '../src/utils/tokens';
import { bearer, makeApp, registerAndLogin, uniqueEmail } from './helpers/app';

describe('auth', () => {
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    app = makeApp();
  });

  it('registers a user, returns an access token, and sets the refresh cookie', async () => {
    const email = uniqueEmail('reg');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', name: 'Ada Lovelace' })
      .expect(201);

    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(10);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe('Ada Lovelace');
    // Fresh accounts are unverified until they click the emailed link.
    expect(res.body.user.emailVerified).toBe(false);

    // Refresh token lives in an httpOnly cookie, never the JSON body.
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${env.COOKIE_NAME}=`))).toBe(true);
    expect(cookies.some((c) => /httponly/i.test(c))).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail('dup');
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', name: 'First' })
      .expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', name: 'Second' })
      .expect(409);
    expect(res.body.error).toBeDefined();
  });

  it('logs in with correct credentials and rejects a wrong password', async () => {
    const email = uniqueEmail('login');
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', name: 'Grace' })
      .expect(201);

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    expect(typeof ok.body.accessToken).toBe('string');
    expect(ok.body.user.email).toBe(email);

    await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('returns the current profile from /me with a bearer token', async () => {
    const { accessToken, user } = await registerAndLogin(request.agent(app));
    const res = await request(app)
      .get('/api/auth/me')
      .set(...bearer(accessToken))
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe(user.email);
  });

  it('rejects /me without a token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('mints a new access token from the refresh cookie', async () => {
    // The agent carries the refresh cookie set during registration.
    const agent = request.agent(app);
    await registerAndLogin(agent);

    const res = await agent.post('/api/auth/refresh').expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(10);
  });

  it('rejects refresh with no cookie', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
  });

  it('verifies an email with a valid token', async () => {
    const { user } = await registerAndLogin(request.agent(app));

    // The real token is only delivered by (console) email and stored hashed, so we
    // mint one through the same code path the service uses and hand back the raw value.
    const raw = randomToken();
    await EmailToken.create({
      user: user.id,
      tokenHash: sha256(raw),
      type: 'verify',
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const res = await request(app).post('/api/auth/verify-email').send({ token: raw }).expect(200);
    expect(res.body.user.emailVerified).toBe(true);

    // And it stuck in the database, not just the response.
    const fresh = await User.findById(user.id).lean();
    expect(fresh?.emailVerified).toBe(true);
  });

  it('resends a verification email for an authenticated user', async () => {
    const { accessToken } = await registerAndLogin(request.agent(app));
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set(...bearer(accessToken))
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
