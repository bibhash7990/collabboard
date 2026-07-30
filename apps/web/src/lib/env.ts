/**
 * Centralized, typed access to the Vite build-time env.
 *
 * When VITE_API_URL / VITE_SOCKET_URL are empty (the single-origin production
 * build), fall back to the page's own origin — so the same bundle works whether
 * it's served by the API server itself or from a separate host you configure.
 */
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : '';

export const APP_ENV = {
  API_URL: import.meta.env.VITE_API_URL || sameOrigin,
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || sameOrigin,
};
