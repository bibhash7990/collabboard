import { nanoid } from 'nanoid';
import type { RegisterRequest } from '@collabboard/shared';
import {
  EmailToken,
  RefreshToken,
  User,
  Workspace,
  WorkspaceMembership,
  type UserDoc,
} from '../../models';
import { hashPassword, verifyPassword } from '../../utils/password';
import {
  durationToMs,
  randomToken,
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type RefreshTokenPayload,
} from '../../utils/tokens';
import { sendMail, verificationEmail } from '../../utils/email';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

/**
 * Auth business logic, kept free of Express so it can be reused (seed, tests) and
 * unit-tested in isolation. Controllers translate its throws into HTTP and own
 * the cookie plumbing.
 */

/** Email verification links stay valid for a day — long enough for a real inbox. */
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export interface TokenMeta {
  userAgent?: string;
  ip?: string;
}

/** Mint + persist a single-use verify token and email the confirmation link. */
async function sendVerification(user: UserDoc): Promise<void> {
  // Only the hash is stored — a DB leak can't be replayed into a valid link.
  const raw = randomToken();
  await EmailToken.create({
    user: user._id,
    tokenHash: sha256(raw),
    type: 'verify',
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const link = `${env.CLIENT_URL}/verify-email?token=${raw}`;
  await sendMail({ ...verificationEmail(user.name, link), to: user.email });
}

/**
 * Create the account plus a personal workspace they own, so a fresh user can
 * create boards immediately without an empty-state dead end. The password is
 * hashed before the row exists; the raw value never lands in Mongo.
 */
export async function registerUser(input: RegisterRequest): Promise<UserDoc> {
  const email = input.email.trim().toLowerCase();
  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({ email, name: input.name, passwordHash });

  const workspace = await Workspace.create({ name: `${user.name}'s Workspace`, owner: user._id });
  await WorkspaceMembership.create({ workspace: workspace._id, user: user._id, role: 'owner' });

  await sendVerification(user);
  return user;
}

/**
 * Verify credentials. The error is deliberately identical for "no such user" and
 * "wrong password" so the endpoint can't be used to enumerate accounts.
 */
export async function authenticate(email: string, password: string): Promise<UserDoc> {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  return user;
}

/**
 * Sign a short-lived access token and mint a rotating refresh token. The refresh
 * token's jti + sha256 are stored so it can be revoked/rotated later; the raw
 * value is returned once for the caller to set as a cookie.
 */
export async function issueTokens(
  user: UserDoc,
  meta: TokenMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, name: user.name });
  const jti = nanoid();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  await RefreshToken.create({
    user: user._id,
    jti,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_TTL)),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  return { accessToken, refreshToken };
}

/**
 * Validate a presented refresh token and rotate it: the old jti is revoked and a
 * brand-new pair is issued. Rotation-on-use means a stolen-then-reused token is
 * already revoked by the time the thief replays it. The stored-hash comparison
 * rejects a well-signed body whose row was already rotated or tampered with.
 */
export async function rotateRefresh(
  token: string,
  meta: TokenMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: RefreshTokenPayload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');
  }

  const stored = await RefreshToken.findOne({ jti: payload.jti });
  if (!stored || stored.revokedAt || stored.tokenHash !== sha256(token)) {
    throw ApiError.unauthorized('Refresh token is no longer valid', 'REFRESH_INVALID');
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token has expired', 'REFRESH_INVALID');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'REFRESH_INVALID');

  stored.revokedAt = new Date();
  await stored.save();
  return issueTokens(user, meta);
}

/** Revoke a refresh token by its jti (logout). No-op if already revoked/unknown. */
export async function revokeRefresh(jti: string): Promise<void> {
  await RefreshToken.updateOne({ jti, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/**
 * Consume a verification token: flip `emailVerified` and delete the token so the
 * link is strictly single-use. Expiry is checked explicitly because the TTL
 * index only sweeps lazily.
 */
export async function verifyEmail(rawToken: string): Promise<UserDoc> {
  const record = await EmailToken.findOne({ tokenHash: sha256(rawToken), type: 'verify' });
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('Verification link is invalid or has expired', 'TOKEN_INVALID');
  }

  const user = await User.findById(record.user);
  if (!user) {
    throw ApiError.badRequest('Verification link is invalid or has expired', 'TOKEN_INVALID');
  }

  user.emailVerified = true;
  await user.save();
  await record.deleteOne();
  return user;
}

/**
 * Re-send verification for an already-authenticated user. Idempotent: verified
 * users are a no-op, and any outstanding tokens are dropped first so only the
 * freshest link works.
 */
export async function resendVerification(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  if (user.emailVerified) return;

  await EmailToken.deleteMany({ user: user._id, type: 'verify' });
  await sendVerification(user);
}
