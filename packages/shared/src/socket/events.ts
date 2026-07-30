import type { Role, DocType } from '../constants.js';

/**
 * The Socket.IO wire protocol, shared verbatim by server and client so a
 * renamed event or changed payload is a compile error on both sides.
 *
 * Conventions:
 *   - Yjs updates travel as base64 strings (binary is awkward over some proxies).
 *   - Every board-scoped event carries `boardId`; the server re-authorizes it.
 *   - Callbacks use a `(res: Ack<T>)` shape so errors are structured, never thrown.
 */

/** Named event constants — import these instead of hand-typing strings. */
export const SOCKET_EVENTS = {
  // client → server
  BOARD_JOIN: 'board:join',
  BOARD_LEAVE: 'board:leave',
  PRESENCE_CURSOR: 'presence:cursor',
  YJS_UPDATE: 'yjs:update',
  YJS_AWARENESS: 'yjs:awareness',
  SNAPSHOT_CREATE: 'snapshot:create',
  // server → client
  BOARD_JOINED: 'board:joined',
  PRESENCE_STATE: 'presence:state',
  PRESENCE_JOIN: 'presence:join',
  PRESENCE_LEAVE: 'presence:leave',
  YJS_BROADCAST: 'yjs:broadcast',
  AWARENESS_BROADCAST: 'awareness:broadcast',
  BOARD_ROLE_CHANGED: 'board:role-changed',
  BOARD_KICKED: 'board:kicked',
  SNAPSHOT_CREATED: 'snapshot:created',
  ERROR: 'error',
} as const;

/** Structured acknowledgement passed to client callbacks. */
export type Ack<T = void> =
  | ({ ok: true } & (T extends void ? { data?: undefined } : { data: T }))
  | { ok: false; error: { code: string; message: string } };

export interface PresenceUser {
  userId: string;
  socketId: string;
  name: string;
  color: string;
  role: Role;
  cursor: { x: number; y: number } | null;
}

export interface BoardJoinedPayload {
  boardId: string;
  role: Role;
  /** base64 Yjs state for each sub-document, to bootstrap the client. */
  state: Record<DocType, string>;
  presence: PresenceUser[];
}

export interface CursorPayload {
  boardId: string;
  x: number;
  y: number;
}

export interface YjsUpdatePayload {
  boardId: string;
  doc: DocType;
  /** base64-encoded Yjs update. */
  update: string;
}

export interface AwarenessPayload {
  boardId: string;
  /** base64-encoded y-protocols awareness update. */
  update: string;
}

export interface SnapshotCreatePayload {
  boardId: string;
  label?: string;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
  event?: string;
}

/** Events the client is allowed to emit. */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.BOARD_JOIN]: (
    payload: { boardId: string },
    ack: (res: Ack<BoardJoinedPayload>) => void,
  ) => void;
  [SOCKET_EVENTS.BOARD_LEAVE]: (payload: { boardId: string }) => void;
  [SOCKET_EVENTS.PRESENCE_CURSOR]: (payload: CursorPayload) => void;
  [SOCKET_EVENTS.YJS_UPDATE]: (payload: YjsUpdatePayload, ack?: (res: Ack) => void) => void;
  [SOCKET_EVENTS.YJS_AWARENESS]: (payload: AwarenessPayload) => void;
  [SOCKET_EVENTS.SNAPSHOT_CREATE]: (
    payload: SnapshotCreatePayload,
    ack?: (res: Ack<{ snapshotId: string }>) => void,
  ) => void;
}

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  [SOCKET_EVENTS.BOARD_JOINED]: (payload: BoardJoinedPayload) => void;
  [SOCKET_EVENTS.PRESENCE_STATE]: (payload: { boardId: string; users: PresenceUser[] }) => void;
  [SOCKET_EVENTS.PRESENCE_JOIN]: (payload: { boardId: string; user: PresenceUser }) => void;
  [SOCKET_EVENTS.PRESENCE_LEAVE]: (payload: {
    boardId: string;
    socketId: string;
    userId: string;
  }) => void;
  [SOCKET_EVENTS.YJS_BROADCAST]: (payload: YjsUpdatePayload) => void;
  [SOCKET_EVENTS.AWARENESS_BROADCAST]: (payload: AwarenessPayload) => void;
  [SOCKET_EVENTS.BOARD_ROLE_CHANGED]: (payload: { boardId: string; role: Role }) => void;
  [SOCKET_EVENTS.BOARD_KICKED]: (payload: { boardId: string; reason: string }) => void;
  [SOCKET_EVENTS.SNAPSHOT_CREATED]: (payload: {
    boardId: string;
    snapshotId: string;
    label: string;
  }) => void;
  [SOCKET_EVENTS.ERROR]: (payload: SocketErrorPayload) => void;
}

/** Per-connection data the auth middleware attaches to `socket.data`. */
export interface SocketData {
  userId: string;
  name: string;
  color: string;
  /** boardId → effective role, cached (with TTL) after the first authorization check. */
  roles: Record<string, Role>;
  /** boardId → latest cursor, so presence can be bootstrapped from live sockets. */
  cursors: Record<string, { x: number; y: number } | null>;
}

export interface InterServerEvents {
  ping: () => void;
}
