import type { Response } from 'express';
import { env } from '../../config/env';
import { durationToMs } from '../../utils/tokens';

/**
 * The refresh token never touches JS on the client — it rides in an httpOnly
 * cookie so an XSS payload can't read it. `sameSite: 'lax'` keeps it off
 * cross-site requests while still surviving top-level navigations. Both helpers
 * share one options object so set/clear can't drift (a mismatched path/domain
 * would leave a stale cookie the browser refuses to overwrite).
 */
const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
  domain: env.COOKIE_DOMAIN,
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
