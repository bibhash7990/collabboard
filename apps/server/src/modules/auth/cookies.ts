import type { Response } from 'express';
import { env } from '../../config/env';
import { durationToMs } from '../../utils/tokens';

/**
 * The refresh token never touches JS on the client — it rides in an httpOnly
 * cookie so an XSS payload can't read it. SameSite is configurable: 'lax' for a
 * same-origin deploy, 'none' when the frontend lives on another domain (browsers
 * then require Secure=true). Both helpers share one options object so set/clear
 * can't drift (a mismatched path/domain would leave a stale cookie the browser
 * refuses to overwrite).
 */
const baseCookieOptions = {
  httpOnly: true,
  sameSite: env.COOKIE_SAMESITE,
  // SameSite=None is invalid without Secure — force it on so prod never silently drops the cookie.
  secure: env.COOKIE_SECURE || env.COOKIE_SAMESITE === 'none',
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/',
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, {
    ...baseCookieOptions,
    // Cookie outlives the refresh JWT itself so the browser keeps sending it up
    // to the moment the token expires; server-side revocation is the real gate.
    maxAge: durationToMs(env.JWT_REFRESH_TTL),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, baseCookieOptions);
}
