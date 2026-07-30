import { useCallback, useEffect, useMemo, useRef } from 'react';
import { LIMITS, SOCKET_EVENTS, type PresenceUser } from '@collabboard/shared';
import { getSocket } from '../lib/socket';
import { useBoardStore } from '../stores/boardStore';

interface UsePresenceResult {
  /** Peers currently on the board (never includes the local user). */
  presence: PresenceUser[];
  /** Throttled cursor broadcaster; coordinates are in stage (logical) space. */
  sendCursor: (x: number, y: number) => void;
}

/**
 * Bridges the socket presence protocol into `boardStore`. The store is the single
 * source of truth the canvas/avatars read from, so this hook only translates
 * events into store mutations and hands back a throttled cursor emitter.
 */
export function usePresence(boardId: string, selfUserId: string | undefined): UsePresenceResult {
  const presenceMap = useBoardStore((s) => s.presence);
  const setPresence = useBoardStore((s) => s.setPresence);
  const upsertPresence = useBoardStore((s) => s.upsertPresence);
  const removePresenceBySocket = useBoardStore((s) => s.removePresenceBySocket);

  const presence = useMemo(() => Object.values(presenceMap), [presenceMap]);

  useEffect(() => {
    const socket = getSocket();

    const onState = (payload: { boardId: string; users: PresenceUser[] }) => {
      if (payload.boardId !== boardId) return;
      // Drop our own entry so we never render a cursor/avatar for ourselves.
      setPresence(payload.users.filter((u) => u.userId !== selfUserId));
    };
    const onJoin = (payload: { boardId: string; user: PresenceUser }) => {
      if (payload.boardId !== boardId || payload.user.userId === selfUserId) return;
      upsertPresence(payload.user);
    };
    const onLeave = (payload: { boardId: string; socketId: string; userId: string }) => {
      if (payload.boardId !== boardId) return;
      removePresenceBySocket(payload.socketId);
    };

    socket.on(SOCKET_EVENTS.PRESENCE_STATE, onState);
    socket.on(SOCKET_EVENTS.PRESENCE_JOIN, onJoin);
    socket.on(SOCKET_EVENTS.PRESENCE_LEAVE, onLeave);

    return () => {
      socket.off(SOCKET_EVENTS.PRESENCE_STATE, onState);
      socket.off(SOCKET_EVENTS.PRESENCE_JOIN, onJoin);
      socket.off(SOCKET_EVENTS.PRESENCE_LEAVE, onLeave);
    };
  }, [boardId, selfUserId, setPresence, upsertPresence, removePresenceBySocket]);

  const lastSent = useRef(0);
  const sendCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastSent.current < LIMITS.CURSOR_THROTTLE_MS) return;
      lastSent.current = now;
      getSocket().emit(SOCKET_EVENTS.PRESENCE_CURSOR, { boardId, x, y });
    },
    [boardId],
  );

  return { presence, sendCursor };
}
