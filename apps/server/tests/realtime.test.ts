import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import {
  SOCKET_EVENTS,
  type Ack,
  type BoardJoinedPayload,
  type YjsUpdatePayload,
} from '@collabboard/shared';
import { createApp } from '../src/app';
import { createSocketServer, emitRoleChanged } from '../src/realtime/gateway';
import { boardDocs } from '../src/realtime/manager';
import { BoardMembership } from '../src/models';
import { bearer, registerAndLogin, type RegisteredUser } from './helpers/app';

/** Resolve once the client is connected (or fail fast on a handshake error). */
function connect(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Emit and resolve with the server's structured ack (callback form works on any Socket). */
function emitAck<T>(socket: Socket, event: string, payload: unknown, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), ms);
    socket.emit(event, payload, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

/** Resolve with the next payload for `event`, or reject on timeout. */
function waitFor<T>(socket: Socket, event: string, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** A tiny Yjs update that inserts one canvas element — base64 as the wire format expects. */
function makeCanvasUpdate(elementId: string, createdBy: string): string {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    ydoc.getMap('elements').set(elementId, {
      id: elementId,
      type: 'rectangle',
      x: 12,
      y: 20,
      width: 120,
      height: 80,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
}

describe('realtime', () => {
  const app = createApp();
  const httpServer = http.createServer(app);
  const ioServer = createSocketServer(httpServer);

  let alice: RegisteredUser;
  let bob: RegisteredUser;
  let boardId: string;
  let url: string;
  let aSocket: Socket;
  let bSocket: Socket;

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

    // Two real users, a shared board, both as editors (Bob added directly since the
    // invite/accept flow is exercised elsewhere and access only reads BoardMembership).
    alice = await registerAndLogin(request.agent(app), { name: 'Alice' });
    bob = await registerAndLogin(request.agent(app), { name: 'Bob' });

    const ws = await request(app)
      .post('/api/workspaces')
      .set(...bearer(alice.accessToken))
      .send({ name: 'Realtime WS' })
      .expect(201);
    const workspaceId = ws.body.workspace.id;

    const board = await request(app)
      .post('/api/boards')
      .set(...bearer(alice.accessToken))
      .send({ workspaceId, title: 'Realtime Board' })
      .expect(201);
    boardId = board.body.board.id;

    await BoardMembership.create({
      board: boardId,
      workspace: workspaceId,
      user: bob.user.id,
      role: 'editor',
    });

    aSocket = await connect(url, alice.accessToken);
    bSocket = await connect(url, bob.accessToken);
  });

  afterAll(async () => {
    aSocket?.close();
    bSocket?.close();
    // Clear any debounced snapshot timers before the DB is torn down by the global teardown.
    await boardDocs.flushAll().catch(() => undefined);
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  });

  it('joins, broadcasts a yjs update cross-client, and enforces a viewer downgrade', async () => {
    // ── Both clients join and learn their real roles ──
    const aJoin = await emitAck<Ack<BoardJoinedPayload>>(aSocket, SOCKET_EVENTS.BOARD_JOIN, {
      boardId,
    });
    const bJoin = await emitAck<Ack<BoardJoinedPayload>>(bSocket, SOCKET_EVENTS.BOARD_JOIN, {
      boardId,
    });
    expect(aJoin.ok).toBe(true);
    expect(bJoin.ok).toBe(true);
    if (!aJoin.ok || !bJoin.ok) throw new Error('board:join failed');
    expect(aJoin.data.role).toBe('owner');
    expect(bJoin.data.role).toBe('editor');

    // ── Alice edits; Bob must receive the identical update ──
    const update = makeCanvasUpdate('el-1', alice.user.id);
    const broadcast = waitFor<YjsUpdatePayload>(bSocket, SOCKET_EVENTS.YJS_BROADCAST);
    const writeAck = await emitAck<Ack>(aSocket, SOCKET_EVENTS.YJS_UPDATE, {
      boardId,
      doc: 'canvas',
      update,
    });
    expect(writeAck.ok).toBe(true);

    const received = await broadcast;
    expect(received.boardId).toBe(boardId);
    expect(received.doc).toBe('canvas');
    // The gateway re-broadcasts the exact base64 it accepted → byte-for-byte match.
    expect(received.update).toBe(update);

    // ── Downgrade Bob to viewer; his next write must be rejected ──
    await BoardMembership.updateOne(
      { board: boardId, user: bob.user.id },
      { $set: { role: 'viewer' } },
    );
    // Push the change so the gateway's per-socket role cache flips immediately.
    emitRoleChanged(boardId, bob.user.id, 'viewer');

    let gotError = false;
    bSocket.once(SOCKET_EVENTS.ERROR, () => {
      gotError = true;
    });
    const rejected = await emitAck<Ack>(bSocket, SOCKET_EVENTS.YJS_UPDATE, {
      boardId,
      doc: 'canvas',
      update: makeCanvasUpdate('el-2', bob.user.id),
    });
    expect(rejected.ok).toBe(false);
    // The server also signals the demotion out-of-band; either signal satisfies the contract.
    expect(rejected.ok === false || gotError).toBe(true);
  }, 25000);
});
