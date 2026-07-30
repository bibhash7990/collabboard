import { useEffect } from 'react';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/authStore';

/**
 * On app load, attempt a silent refresh (using the httpOnly cookie) to restore
 * the session, then fetch the current user. Flips `ready` when settled so the
 * router can stop showing a splash.
 */
export function useAuthBootstrap(): void {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setReady = useAuthStore((s) => s.setReady);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { accessToken } = await authApi.refresh();
        useAuthStore.getState().setAccessToken(accessToken);
        const user = await authApi.me();
        if (!cancelled) setAuth(user, accessToken);
      } catch {
        /* no valid session — stays logged out */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAuth, setReady]);
}
