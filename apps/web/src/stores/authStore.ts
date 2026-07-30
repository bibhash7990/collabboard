import { create } from 'zustand';
import type { Me } from '@collabboard/shared';

interface AuthState {
  user: Me | null;
  accessToken: string | null;
  /** false until the initial silent-refresh attempt resolves. */
  ready: boolean;
  setAuth: (user: Me, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: Me) => void;
  setReady: (ready: boolean) => void;
  clear: () => void;
}

/**
 * Auth lives in memory only — the refresh token is an httpOnly cookie the JS
 * never sees. The access token is re-minted on load via a silent refresh.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  ready: false,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  clear: () => set({ user: null, accessToken: null }),
}));

/** Synchronous token read for the axios request interceptor. */
export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
