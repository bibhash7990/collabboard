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
import { createSocketServer } from '../src/realtime/gateway';
import { boardDocs } from '../src/realtime/manager';
import { BoardMembership } from '../src/models';
import { bearer, registerAndLogin, type RegisteredUser } from './helpers/app';

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

function connect(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    const timer = setTimeout(() => reject(new Error('connect timeout')), 8000);
    socket.on('connect', () => (clearTimeout(timer), resolve(socket)));
    socket.on('connect_error', (err) => (clearTimeout(timer), reject(err)));
  });
}

function emitAck<T>(socket: Socket, event: string, payload: unknown, ms = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout ${event}`)), ms);
    socket.emit(event, payload, (res: T) => (clearTimeout(timer), resolve(res)));
  });
}

async function waitUntil(cond: () => boolean, ms = 8000, step = 25): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitUntil timeout');
    await new Promise((r) => setTimeout(r, step));
  }
}

/** A faithful mini-client: a Yjs doc wired to the socket exactly like the real BoardConnection. */
class Client {
  readonly doc = new Y.Doc();
  constructor(
    readonly socket: Socket,
    readonly boardId: string,
  ) {
    this.doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return; // don't echo applied broadcasts
      socket.emit(SOCKET_EVENTS.YJS_UPDATE, { boardId, doc: 'canvas', update: b64(u) });
    });
    socket.on(SOCKET_EVENTS.YJS_BROADCAST, (p: YjsUpdatePayload) => {
      if (p.boardId === boardId && p.doc === 'canvas') Y.applyUpdate(this.doc, unb64(p.update), 'remote');
    });
  }
  get map() {
    return this.doc.getMap('elements');
  }
  bootstrap(canvasState: string) {
    Y.applyUpdate(this.doc, unb64(canvasState), 'remote');
  }
  add(id: string) {
    this.map.set(id, { id, type: 'rectangle', x: 1, y: 1, createdBy: 'u', createdAt: 1, updatedAt: 1 });
  }
  keys() {
    return [...this.map.keys()].sort();
  }
}

async function serverKeys(boardId: string): Promise<string[]> {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, unb64(await boardDocs.getState(boardId, 'canvas')));
  return [...doc.getMap('elements').keys()].sort();
}

describe('realtime concurrency, restore, and offline re-sync', () => {
  const app = createApp();
  const httpServer = http.createServer(app);
  const ioServer = createSocketServer(httpServer);
  let url: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await boardDocs.flushAll().catch(() => undefined);
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  });

  /** Register `names`, create a board owned by the first, add the rest as editors, join all. */
  async function makeClients(names: string[]): Promise<{ owner: RegisteredUser; boardId: string; clients: Client[] }> {
    const users: RegisteredUser[] = [];
    for (const name of names) users.push(await registerAndLogin(request.agent(app), { name }));
    const owner = users[0];
    const ws = await request(app).post('/api/workspaces').set(...bearer(owner.accessToken)).send({ name: 'WS' }).expect(201);
    const workspaceId = ws.body.workspace.id;
    const board = await request(app).post('/api/boards').set(...bearer(owner.accessToken)).send({ workspaceId, title: 'B' }).expect(201);
    const boardId = board.body.board.id;
    for (let i = 1; i < users.length; i++) {
      await BoardMembership.create({ board: boardId, workspace: workspaceId, user: users[i].user.id, role: 'editor' });
    }
    const clients: Client[] = [];
    for (const u of users) {
      const socket = await connect(url, u.accessToken);
      const client = new Client(socket, boardId);
      const ack = await emitAck<Ack<BoardJoinedPayload>>(socket, SOCKET_EVENTS.BOARD_JOIN, { boardId });
      if (ack.ok) client.bootstrap(ack.data.state.canvas);
      clients.push(client);
    }
    return { owner, boardId, clients };
  }

  it('converges 3 concurrent clients with no lost updates', async () => {
    const { boardId, clients } = await makeClients(['A', 'B', 'C']);
    // Three simultaneous edits, one per client.
    clients[0].add('a');
    clients[1].add('b');
    clients[2].add('c');

    await waitUntil(() => clients.every((c) => c.keys().length === 3));
    for (const c of clients) expect(c.keys()).toEqual(['a', 'b', 'c']);
    expect(await serverKeys(boardId)).toEqual(['a', 'b', 'c']);

    clients.forEach((c) => c.socket.close());
  }, 30000);

  it('restore-to-snapshot removes edits made after the snapshot', async () => {
    const { owner, boardId, clients } = await makeClients(['A', 'B']);
    clients[0].add('keep');
    await waitUntil(() => clients.every((c) => c.keys().includes('keep')));

    const snap = await request(app).post(`/api/boards/${boardId}/snapshots`).set(...bearer(owner.accessToken)).send({ label: 'v1' }).expect(201);
    const snapshotId = snap.body.snapshotId as string;
    expect(snapshotId).toBeTruthy();

    clients[0].add('later');
    await waitUntil(() => clients.every((c) => c.keys().includes('later')));

    await request(app).post(`/api/boards/${boardId}/snapshots/restore`).set(...bearer(owner.accessToken)).send({ snapshotId }).expect(200);

    // The reconciling delta must remove 'later' on every connected client + the server.
    await waitUntil(() => clients.every((c) => c.keys().includes('keep') && !c.keys().includes('later')));
    for (const c of clients) expect(c.keys()).toEqual(['keep']);
    expect(await serverKeys(boardId)).toEqual(['keep']);

    clients.forEach((c) => c.socket.close());
  }, 30000);

  it('re-syncs an edit made while offline on reconnect', async () => {
    const { boardId, clients } = await makeClients(['A', 'B']);
    const [a, bClient] = clients;

    a.socket.disconnect(); // A goes offline
    a.add('offline'); // local-only edit while disconnected
    bClient.add('online'); // B keeps editing live
    await waitUntil(() => bClient.keys().includes('online'));

    // A reconnects, re-joins, catches up, and pushes its offline state.
    await new Promise<void>((resolve, reject) => {
      a.socket.once('connect', () => resolve());
      a.socket.once('connect_error', reject);
      a.socket.connect();
    });
    const ack = await emitAck<Ack<BoardJoinedPayload>>(a.socket, SOCKET_EVENTS.BOARD_JOIN, { boardId });
    if (ack.ok) a.bootstrap(ack.data.state.canvas);
    a.socket.emit(SOCKET_EVENTS.YJS_UPDATE, { boardId, doc: 'canvas', update: b64(Y.encodeStateAsUpdate(a.doc)) });

    await waitUntil(() => bClient.keys().includes('offline') && bClient.keys().includes('online'));
    expect(a.keys()).toEqual(['offline', 'online']);
    expect(bClient.keys()).toEqual(['offline', 'online']);
    expect(await serverKeys(boardId)).toEqual(['offline', 'online']);

    clients.forEach((c) => c.socket.close());
  }, 30000);
});
