import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@collabboard/shared';
import { APP_ENV } from './env';
import { getAccessToken, useAuthStore } from '../stores/authStore';
import { refreshAccessToken } from './apiClient';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * A single shared Socket.IO connection for the whole app. The auth token is
 * sent via an `auth` *callback*, so every (re)connect picks up the freshest
 * access token — critical for surviving access-token expiry mid-session.
 */
export function getSocket(): AppSocket {
  if (socket) return socket;
  socket = io(APP_ENV.SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
  }) as AppSocket;

  // If the server rejects the token (expired), silently refresh and retry once per cycle.
  socket.on('connect_error', async (err) => {
    if (err.message === 'UNAUTHORIZED' && useAuthStore.getState().user) {
      try {
        await refreshAccessToken();
        socket?.connect();
      } catch {
        /* refresh failed → user is effectively logged out; UI handles redirect */
      }
    }
  });

  return socket;
}

export function connectSocket(): AppSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
