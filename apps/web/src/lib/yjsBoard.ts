import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import {
  SOCKET_EVENTS,
  type BoardJoinedPayload,
  type DocType,
  type Role,
} from '@collabboard/shared';
import type { AppSocket } from './socket';
import { toB64, fromB64 } from './base64';

/** Tag used so updates we apply from the network don't echo back out. */
const REMOTE = 'remote';

export type ConnStatus = 'connecting' | 'online' | 'offline';

interface UserInfo {
  id: string;
  name: string;
  color: string;
}

/**
 * Client-side board CRDT. Owns two Yjs docs (canvas + notes), persists both to
 * IndexedDB for offline use, and relays updates over the shared socket. On every
 * (re)connect it re-joins and pushes its full local state so edits made while
 * offline merge cleanly — conflict-free by construction.
 */
export class BoardConnection {
  readonly canvasDoc = new Y.Doc();
  readonly notesDoc = new Y.Doc();
  readonly awareness: Awareness;
  role: Role = 'viewer';

  onJoined?: (payload: BoardJoinedPayload) => void;
  onError?: (err: { code: string; message: string }) => void;

  private socket: AppSocket | null = null;
  private idbCanvas: IndexeddbPersistence;
  private idbNotes: IndexeddbPersistence;
  private status: ConnStatus = 'connecting';
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private destroyed = false;

  constructor(
    readonly boardId: string,
    user: UserInfo,
  ) {
    this.awareness = new Awareness(this.notesDoc);
    this.awareness.setLocalStateField('user', {
      name: user.name,
      color: user.color,
      id: user.id,
    });
    this.idbCanvas = new IndexeddbPersistence(`cb-canvas-${boardId}`, this.canvasDoc);
    this.idbNotes = new IndexeddbPersistence(`cb-notes-${boardId}`, this.notesDoc);

    this.canvasDoc.on('update', this.handleLocalUpdate('canvas'));
    this.notesDoc.on('update', this.handleLocalUpdate('notes'));
    this.awareness.on('update', this.handleAwarenessUpdate);
  }

  private docFor(doc: DocType): Y.Doc {
    return doc === 'canvas' ? this.canvasDoc : this.notesDoc;
  }

  private applyRemote(doc: DocType, update: Uint8Array): void {
    Y.applyUpdate(this.docFor(doc), update, REMOTE);
  }

  private handleLocalUpdate = (doc: DocType) => (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || origin === this.idbCanvas || origin === this.idbNotes) return;
    if (this.socket?.connected) {
      this.socket.emit(SOCKET_EVENTS.YJS_UPDATE, {
        boardId: this.boardId,
        doc,
        update: toB64(update),
      });
    }
    // If offline, the update is already in IndexedDB and is pushed on reconnect.
  };

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === REMOTE) return;
    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    const update = encodeAwarenessUpdate(this.awareness, changed);
    this.socket?.emit(SOCKET_EVENTS.YJS_AWARENESS, {
      boardId: this.boardId,
      update: toB64(update),
    });
  };

  /** Attach to the shared socket and (re)join on every connect. */
  connect(socket: AppSocket): void {
    this.socket = socket;
    socket.on(SOCKET_EVENTS.YJS_BROADCAST, this.onBroadcast);
    socket.on(SOCKET_EVENTS.AWARENESS_BROADCAST, this.onAwarenessBroadcast);
    socket.on('connect', this.join);
    socket.on('disconnect', this.onDisconnect);
    if (socket.connected) this.join();
  }

  private join = (): void => {
    if (this.destroyed || !this.socket) return;
    this.setStatus('connecting');
    // Wait for IndexedDB to hydrate so offline edits are included in the push.
    Promise.all([this.idbCanvas.whenSynced, this.idbNotes.whenSynced]).then(() => {
      if (this.destroyed || !this.socket) return;
      this.socket.emit(SOCKET_EVENTS.BOARD_JOIN, { boardId: this.boardId }, (res) => {
        if (!res.ok) {
          this.setStatus('offline');
          this.onError?.(res.error);
          return;
        }
        this.role = res.data.role;
        this.applyRemote('canvas', fromB64(res.data.state.canvas));
        this.applyRemote('notes', fromB64(res.data.state.notes));
        // Push our full local state so any offline edits merge server-side.
        if (this.role !== 'viewer') {
          this.pushFullState('canvas');
          this.pushFullState('notes');
        }
        this.setStatus('online');
        this.onJoined?.(res.data);
      });
    });
  };

  private pushFullState(doc: DocType): void {
    const update = Y.encodeStateAsUpdate(this.docFor(doc));
    this.socket?.emit(SOCKET_EVENTS.YJS_UPDATE, {
      boardId: this.boardId,
      doc,
      update: toB64(update),
    });
  }

  private onBroadcast = (payload: { boardId: string; doc: DocType; update: string }): void => {
    if (payload.boardId !== this.boardId) return;
    this.applyRemote(payload.doc, fromB64(payload.update));
  };

  private onAwarenessBroadcast = (payload: { boardId: string; update: string }): void => {
    if (payload.boardId !== this.boardId) return;
    applyAwarenessUpdate(this.awareness, fromB64(payload.update), REMOTE);
  };

  private onDisconnect = (): void => this.setStatus('offline');

  onStatus(cb: (s: ConnStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(s: ConnStatus): void {
    this.status = s;
    for (const cb of this.statusListeners) cb(s);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.socket) {
      this.socket.emit(SOCKET_EVENTS.BOARD_LEAVE, { boardId: this.boardId });
      this.socket.off(SOCKET_EVENTS.YJS_BROADCAST, this.onBroadcast);
      this.socket.off(SOCKET_EVENTS.AWARENESS_BROADCAST, this.onAwarenessBroadcast);
      this.socket.off('connect', this.join);
      this.socket.off('disconnect', this.onDisconnect);
    }
    this.awareness.destroy();
    void this.idbCanvas.destroy();
    void this.idbNotes.destroy();
    this.canvasDoc.destroy();
    this.notesDoc.destroy();
    this.statusListeners.clear();
  }
}
