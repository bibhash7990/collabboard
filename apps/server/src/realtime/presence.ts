import type { PresenceUser } from '@collabboard/shared';
import { boardRoom, type IOServer, type IOSocket } from './socketTypes';

/** Build a PresenceUser from a socket's attached data. */
export function toPresence(socket: IOSocket, boardId: string): PresenceUser {
  return {
    userId: socket.data.userId,
    socketId: socket.id,
    name: socket.data.name,
    color: socket.data.color,
    role: socket.data.roles[boardId] ?? 'viewer',
    cursor: socket.data.cursors[boardId] ?? null,
  };
}

/**
 * Snapshot everyone currently in a board room — adapter-aware, so it spans all
 * nodes in a Redis-backed cluster. Deduped so a user with two tabs appears once
 * (their most recent socket wins).
 */
export async function presenceSnapshot(io: IOServer, boardId: string): Promise<PresenceUser[]> {
  const sockets = await io.in(boardRoom(boardId)).fetchSockets();
  const byUser = new Map<string, PresenceUser>();
  for (const s of sockets) {
    byUser.set(s.data.userId, {
      userId: s.data.userId,
      socketId: s.id,
      name: s.data.name,
      color: s.data.color,
      role: s.data.roles[boardId] ?? 'viewer',
      cursor: s.data.cursors[boardId] ?? null,
    });
  }
  return [...byUser.values()];
}
