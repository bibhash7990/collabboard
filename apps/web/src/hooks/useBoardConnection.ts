import { useEffect, useState } from 'react';
import type { Role } from '@collabboard/shared';
import { BoardConnection, type ConnStatus } from '../lib/yjsBoard';
import { connectSocket } from '../lib/socket';
import { useBoardStore } from '../stores/boardStore';

interface CurrentUser {
  id: string;
  name: string;
  color: string;
}

export interface BoardConnectionState {
  /** Null until the effect has built the connection (also during teardown). */
  connection: BoardConnection | null;
  status: ConnStatus;
  /** Role reported by the server on join; refined by BOARD_ROLE_CHANGED upstream. */
  role: Role;
  error: string | null;
}

/**
 * Owns exactly one `BoardConnection` for a (board, user) pair. The connection is
 * built inside the effect — not on every render — so React re-renders never spawn
 * a second CRDT/socket pair. On board change or unmount it is destroyed and live
 * presence is cleared so a stale peer list can't leak into the next board.
 */
export function useBoardConnection(
  boardId: string,
  user: CurrentUser | null,
): BoardConnectionState {
  const [connection, setConnection] = useState<BoardConnection | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);
  const resetPresence = useBoardStore((s) => s.resetPresence);

  // Re-keyed on the identity fields only, so ordinary parent re-renders (which
  // may hand us a fresh object with identical values) don't rebuild the socket.
  const userId = user?.id;
  const userName = user?.name;
  const userColor = user?.color;

  useEffect(() => {
    if (!userId || !userName || !userColor) return;

    const conn = new BoardConnection(boardId, { id: userId, name: userName, color: userColor });
    setConnection(conn);
    setRole('viewer');
    setError(null);

    conn.onJoined = (payload) => setRole(payload.role);
    conn.onError = (err) => setError(err.message);

    // Shared app socket; the connection re-joins on every (re)connect internally.
    conn.connect(connectSocket());
    const unsubscribe = conn.onStatus(setStatus);

    return () => {
      unsubscribe();
      conn.destroy();
      resetPresence();
      setConnection(null);
    };
  }, [boardId, userId, userName, userColor, resetPresence]);

  return { connection, status, role, error };
}
