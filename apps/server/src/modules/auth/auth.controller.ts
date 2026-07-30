import type { Request } from 'express';
import type { LoginRequest, RegisterRequest, VerifyEmailRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { toMe } from '../../services/serialize';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { verifyRefreshToken } from '../../utils/tokens';
import { User } from '../../models';
import { setRefreshCookie, clearRefreshCookie } from './cookies';
import {
  authenticate,
  issueTokens,
  registerUser,
  resendVerification as resendVerificationService,
  revokeRefresh,
  rotateRefresh,
  verifyEmail as verifyEmailService,
} from './auth.service';

/** Bind a refresh token to the client that requested it, for the audit trail. */
function tokenMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

/** Read the refresh token straight from its httpOnly cookie (never a header). */
function readRefreshCookie(req: Request): string | undefined {
  return req.cookies?.[env.COOKIE_NAME];
}

export const register = asyncHandler(async (req, res) => {
  const body = req.body as RegisterRequest;
  const user = await registerUser(body);
  const { accessToken, refreshToken } = await issueTokens(user, tokenMeta(req));
  setRefreshCookie(res, refreshToken);
  // AuthResponse: the access token in the body, refresh token in the cookie.
  res.status(201).json({ user: toMe(user), accessToken });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as LoginRequest;
  const user = await authenticate(email, password);
  const { accessToken, refreshToken } = await issueTokens(user, tokenMeta(req));
  setRefreshCookie(res, refreshToken);
  res.json({ user: toMe(user), accessToken });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) throw ApiError.unauthorized('Missing refresh token', 'REFRESH_MISSING');
  const { accessToken, refreshToken } = await rotateRefresh(token, tokenMeta(req));
  // Rotation issued a new refresh token — overwrite the cookie so the old one dies.
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken });
});

export const logout = asyncHandler(async (req, res) => {
  const token = readRefreshCookie(req);
  if (token) {
    try {
      // Best-effort revoke; an already-expired token has nothing to invalidate.
      const { jti } = verifyRefreshToken(token);
      await revokeRefresh(jti);
    } catch {
      /* invalid/expired token — clearing the cookie below is enough */
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  res.json({ user: toMe(user) });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body as VerifyEmailRequest;
  const user = await verifyEmailService(token);
  res.json({ user: toMe(user) });
});

export const resendVerification = asyncHandler(async (req, res) => {
  await resendVerificationService(req.user!.id);
  res.json({ ok: true });
});
