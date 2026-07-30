import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  SOCKET_EVENTS,
  hasAtLeastRole,
  colorForId,
  type Role,
  type CursorPayload,
  type YjsUpdatePayload,
  type AwarenessPayload,
  type SnapshotCreatePayload,
  type BoardJoinedPayload,
} from '@collabboard/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getRedisClients } from '../config/redis';
import { verifyAccessToken } from '../utils/tokens';
import { getBoardRole } from '../services/access';
import { BoardMembership } from '../models';
import { boardDocs } from './manager';
import { presenceSnapshot, toPresence } from './presence';
import { boardRoom, userRoom, type IOServer, type IOSocket } from './socketTypes';

const ROLE_CACHE_TTL_MS = 20_000;

/** Module-level singletons so REST controllers can push role changes / kicks. */
let io: IOServer | null = null;
const userSockets = new Map<string, Set<IOSocket>>();
const roleCache = new WeakMap<IOSocket, Map<string, { role: Role; exp: number }>>();

function cacheFor(socket: IOSocket): Map<string, { role: Role; exp: number }> {
  let m = roleCache.get(socket);
  if (!m) {
    m = new Map();
    roleCache.set(socket, m);
  }
  return m;
}

/**
 * The authorization gate for every board-scoped socket event. Uses a short TTL
 * cache to avoid a DB round-trip per pen stroke, but role upgrades are pushed
 * eagerly by `emitRoleChanged`, so a *fresh* cache entry can be trusted to deny.
 */
async function authorize(socket: IOSocket, boardId: string, required: Role): Promise<Role | null> {
  const cache = cacheFor(socket);
  const hit = cache.get(boardId);
  const now = Date.now();
  if (hit && hit.exp > now) {
    return hasAtLeastRole(hit.role, required) ? hit.role : null;
  }
  const role = await getBoardRole(socket.data.userId, boardId);
  if (!role) {
    cache.delete(boardId);
    delete socket.data.roles[boardId];
    return null;
  }
  cache.set(boardId, { role, exp: now + ROLE_CACHE_TTL_MS });
  socket.data.roles[boardId] = role;
  return hasAtLeastRole(role, required) ? role : null;
}

/** Accepts any per-event ack callback (they all admit the `{ok:false}` branch). */
function ackError(
  ack: ((res: { ok: false; error: { code: string; message: string } }) => void) | undefined,
  code: string,
  message: string,
): void {
  ack?.({ ok: false, error: { code, message } });
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    maxHttpBufferSize: 5e6, // room for Yjs updates
  });

  const redis = getRedisClients();
  if (redis) {
    io.adapter(createAdapter(redis.pub, redis.sub));
    logger.info('Socket.IO Redis adapter enabled');
  }
  boardDocs.init();

  // ── Connection auth: a valid access token is mandatory. ──
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.name = payload.name;
      socket.data.color = '';
      socket.data.roles = {};
      socket.data.cursors = {};
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => registerHandlers(socket));
  return io;
}

function registerHandlers(socket: IOSocket): void {
  const { userId } = socket.data;
  socket.join(userRoom(userId));
  let set = userSockets.get(userId);
  if (!set) userSockets.set(userId, (set = new Set()));
  set.add(socket);
  logger.debug({ userId, socketId: socket.id }, 'socket connected');

  socket.on(SOCKET_EVENTS.BOARD_JOIN, async ({ boardId }, ack) => {
    try {
      const role = await authorize(socket, boardId, 'viewer');
      if (!role) return ackError(ack, 'FORBIDDEN', 'No access to this board');

      await socket.join(boardRoom(boardId));
      socket.data.color = colorForId(userId);
      // Fire-and-forget: record "last opened" for the board list.
      BoardMembership.updateOne(
        { board: boardId, user: userId },
        { $set: { lastOpenedAt: new Date() } },
      ).catch(() => undefined);

      const [canvasState, notesState, presence] = await Promise.all([
        boardDocs.getState(boardId, 'canvas'),
        boardDocs.getState(boardId, 'notes'),
        presenceSnapshot(io!, boardId),
      ]);
      await boardDocs.acquire(boardId);

      const payload: BoardJoinedPayload = {
        boardId,
        role,
        state: { canvas: canvasState, notes: notesState },
        presence,
      };
      ack({ ok: true, data: payload });
      socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_JOIN, {
        boardId,
        user: toPresence(socket, boardId),
      });
    } catch (err) {
      logger.error({ err }, 'board:join failed');
      ackError(ack, 'INTERNAL', 'Failed to join board');
    }
  });

  socket.on(SOCKET_EVENTS.BOARD_LEAVE, ({ boardId }) => leaveBoard(socket, boardId));

  socket.on(SOCKET_EVENTS.PRESENCE_CURSOR, async ({ boardId, x, y }: CursorPayload) => {
    if (!socket.rooms.has(boardRoom(boardId))) return;
    const role = await authorize(socket, boardId, 'viewer');
    if (!role) return;
    socket.data.cursors[boardId] = { x, y };
    socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_STATE, {
      boardId,
      users: [toPresence(socket, boardId)],
    });
  });

  socket.on(SOCKET_EVENTS.YJS_UPDATE, async ({ boardId, doc, update }: YjsUpdatePayload, ack) => {
    // Writes require editor — re-checked here, never trusting the client.
    const role = await authorize(socket, boardId, 'editor');
    if (!role) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'FORBIDDEN',
        message: 'You have view-only access to this board',
        event: SOCKET_EVENTS.YJS_UPDATE,
      });
      return ackError(ack, 'FORBIDDEN', 'View-only access');
    }
    try {
      await boardDocs.applyLocalUpdate(boardId, doc, update, userId);
      // Adapter fans this out to every other client across all nodes.
      socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.YJS_BROADCAST, { boardId, doc, update });
      ack?.({ ok: true });
    } catch (err) {
      logger.error({ err }, 'yjs:update failed');
      ackError(ack, 'INTERNAL', 'Failed to apply update');
    }
  });

  socket.on(SOCKET_EVENTS.YJS_AWARENESS, async ({ boardId, update }: AwarenessPayload) => {
    if (!socket.rooms.has(boardRoom(boardId))) return;
    const role = await authorize(socket, boardId, 'viewer');
    if (!role) return;
    socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.AWARENESS_BROADCAST, { boardId, update });
  });

  socket.on(
    SOCKET_EVENTS.SNAPSHOT_CREATE,
    async ({ boardId, label }: SnapshotCreatePayload, ack) => {
      const role = await authorize(socket, boardId, 'editor');
      if (!role) return ackError(ack, 'FORBIDDEN', 'Editor access required');
      try {
        const id = await boardDocs.createSnapshot(boardId, 'canvas', {
          label: label ?? 'Manual snapshot',
          createdBy: userId,
        });
        await boardDocs.createSnapshot(boardId, 'notes', {
          label: label ?? 'Manual snapshot',
          createdBy: userId,
        });
        io!.to(boardRoom(boardId)).emit(SOCKET_EVENTS.SNAPSHOT_CREATED, {
          boardId,
          snapshotId: id ?? '',
          label: label ?? 'Manual snapshot',
        });
        ack?.({ ok: true, data: { snapshotId: id ?? '' } });
      } catch (err) {
        logger.error({ err }, 'snapshot:create failed');
        ackError(ack, 'INTERNAL', 'Failed to create snapshot');
      }
    },
  );

  socket.on('disconnect', () => {
    for (const boardId of currentBoards(socket)) leaveBoard(socket, boardId, false);
    const s = userSockets.get(userId);
    s?.delete(socket);
    if (s && s.size === 0) userSockets.delete(userId);
    logger.debug({ userId, socketId: socket.id }, 'socket disconnected');
  });
}

function currentBoards(socket: IOSocket): string[] {
  return [...socket.rooms]
    .filter((r) => r.startsWith('board:'))
    .map((r) => r.slice('board:'.length));
}

function leaveBoard(socket: IOSocket, boardId: string, doLeave = true): void {
  if (doLeave) void socket.leave(boardRoom(boardId));
  boardDocs.release(boardId);
  delete socket.data.cursors[boardId];
  socket.to(boardRoom(boardId)).emit(SOCKET_EVENTS.PRESENCE_LEAVE, {
    boardId,
    socketId: socket.id,
    userId: socket.data.userId,
  });
}

/* ── REST-callable side effects ────────────────────────────────────────── */

/** Push a role change to a user's live sockets (and refresh their cache). */
export function emitRoleChanged(boardId: string, userId: string, role: Role): void {
  if (!io) return;
  for (const socket of userSockets.get(userId) ?? []) {
    socket.data.roles[boardId] = role;
    cacheFor(socket).set(boardId, { role, exp: Date.now() + ROLE_CACHE_TTL_MS });
  }
  io.to(userRoom(userId)).emit(SOCKET_EVENTS.BOARD_ROLE_CHANGED, { boardId, role });
}

/** Force a user out of a board (membership revoked). */
export function emitKicked(boardId: string, userId: string, reason = 'Access revoked'): void {
  if (!io) return;
  for (const socket of userSockets.get(userId) ?? []) {
    cacheFor(socket).delete(boardId);
    delete socket.data.roles[boardId];
    void socket.leave(boardRoom(boardId));
  }
  io.to(userRoom(userId)).emit(SOCKET_EVENTS.BOARD_KICKED, { boardId, reason });
}

export function getIo(): IOServer | null {
  return io;
}
