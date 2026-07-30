/** Centralized, typed access to the Vite build-time env. */
export const APP_ENV = {
  API_URL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000',
};
