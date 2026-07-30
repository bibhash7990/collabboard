import * as Y from 'yjs';
import { nanoid } from 'nanoid';
import { DOC_TYPES, type DocType } from '@collabboard/shared';
import { BoardOp, Snapshot, Note } from '../models';
import { getRedisClients } from '../config/redis';
import { logger } from '../config/logger';
import { xmlFragmentToText, toB64, fromB64, bufToU8 } from './yjsText';

const REDIS_CHANNEL = 'cb:yjs';
const SNAPSHOT_DEBOUNCE_MS = 4000;
const OPS_PER_SNAPSHOT = 150;
const IDLE_UNLOAD_MS = 5 * 60 * 1000;

interface DocState {
  ydoc: Y.Doc;
  seq: number;
  opsSinceSnapshot: number;
  snapshotSeq: number;
  snapshotTimer?: ReturnType<typeof setTimeout>;
}

interface BoardState {
  docs: Record<DocType, DocState>;
  refs: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Owns the authoritative in-memory Y.Doc for every active board. Responsibilities:
 *   1. Hydrate a board from `latest snapshot + ops-since` on first use (fast load).
 *   2. Apply + persist client updates to the append-only op log.
 *   3. Debounce full-state snapshots and prune folded ops (log compaction).
 *   4. Converge sibling nodes' in-memory docs over Redis pub/sub (horizontal scale).
 *
 * It never touches sockets — the gateway owns client I/O. This keeps the CRDT
 * engine testable in isolation.
 */
export class BoardDocManager {
  private boards = new Map<string, BoardState>();
  private readonly nodeId = nanoid(8);
  private initialized = false;

  /** Wire up the cross-node subscriber. Safe to call once at startup. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    const redis = getRedisClients();
    if (!redis) {
      logger.info('BoardDocManager: single-node mode (no Redis)');
      return;
    }
    redis.sub
      .subscribe(REDIS_CHANNEL)
      .catch((err) => logger.error({ err }, 'yjs subscribe failed'));
    redis.sub.on('message', (channel, raw) => {
      if (channel !== REDIS_CHANNEL) return;
      try {
        const msg = JSON.parse(raw) as {
          boardId: string;
          doc: DocType;
          update: string;
          origin: string;
        };
        if (msg.origin === this.nodeId) return; // our own echo
        this.applyRemoteUpdate(msg.boardId, msg.doc, fromB64(msg.update));
      } catch (err) {
        logger.error({ err }, 'bad yjs pubsub message');
      }
    });
    logger.info({ nodeId: this.nodeId }, 'BoardDocManager: multi-node mode (Redis pub/sub)');
  }

  /** Load (hydrating if needed) and pin a board in memory; call `release` when done. */
  async acquire(boardId: string): Promise<BoardState> {
    const state = await this.ensureLoaded(boardId);
    state.refs += 1;
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = undefined;
    }
    return state;
  }

  release(boardId: string): void {
    const state = this.boards.get(boardId);
    if (!state) return;
    state.refs = Math.max(0, state.refs - 1);
    if (state.refs === 0 && !state.idleTimer) {
      state.idleTimer = setTimeout(() => void this.unload(boardId), IDLE_UNLOAD_MS);
    }
  }

  private async ensureLoaded(boardId: string): Promise<BoardState> {
    const existing = this.boards.get(boardId);
    if (existing) return existing;
    const docs = {} as Record<DocType, DocState>;
    for (const doc of DOC_TYPES) docs[doc] = await this.hydrateDoc(boardId, doc);
    const state: BoardState = { docs, refs: 0 };
    this.boards.set(boardId, state);
    return state;
  }

  /** Reconstruct a sub-document: apply latest snapshot, then replay newer ops. */
  private async hydrateDoc(boardId: string, doc: DocType): Promise<DocState> {
    const ydoc = new Y.Doc();
    let snapshotSeq = 0;
    const snap = await Snapshot.findOne({ board: boardId, doc }).sort({ createdAt: -1 }).lean();
    if (snap) {
      Y.applyUpdate(ydoc, bufToU8(snap.state));
      snapshotSeq = snap.seq;
    }
    const ops = await BoardOp.find({ board: boardId, doc, seq: { $gt: snapshotSeq } })
      .sort({ seq: 1 })
      .lean();
    let seq = snapshotSeq;
    for (const op of ops) {
      Y.applyUpdate(ydoc, bufToU8(op.update));
      seq = op.seq;
    }
    return { ydoc, seq, opsSinceSnapshot: ops.length, snapshotSeq };
  }

  /** base64 full-state update for bootstrapping a joining client. */
  async getState(boardId: string, doc: DocType): Promise<string> {
    const state = await this.ensureLoaded(boardId);
    return toB64(Y.encodeStateAsUpdate(state.docs[doc].ydoc));
  }

  /**
   * Apply a client-originated update: mutate the doc, persist it as an op, fan it
   * out to sibling nodes, and schedule snapshot compaction. Returns the new seq.
   */
  async applyLocalUpdate(
    boardId: string,
    doc: DocType,
    updateB64: string,
    actorId: string | null,
  ): Promise<number> {
    const state = await this.ensureLoaded(boardId);
    const docState = state.docs[doc];
    const update = fromB64(updateB64);
    Y.applyUpdate(docState.ydoc, update);
    const seq = ++docState.seq;
    docState.opsSinceSnapshot += 1;

    await BoardOp.create({ board: boardId, doc, update: Buffer.from(update), seq, actor: actorId });

    const redis = getRedisClients();
    if (redis) {
      redis.pub
        .publish(
          REDIS_CHANNEL,
          JSON.stringify({ boardId, doc, update: updateB64, origin: this.nodeId }),
        )
        .catch((err) => logger.error({ err }, 'yjs publish failed'));
    }

    this.scheduleSnapshot(boardId, doc);
    return seq;
  }

  /** Apply an update received from a sibling node — in-memory only, no re-persist. */
  private applyRemoteUpdate(boardId: string, doc: DocType, update: Uint8Array): void {
    const state = this.boards.get(boardId);
    if (!state) return; // not loaded here → DB is source of truth on next hydrate
    Y.applyUpdate(state.docs[doc].ydoc, update);
  }

  private scheduleSnapshot(boardId: string, doc: DocType): void {
    const state = this.boards.get(boardId);
    if (!state) return;
    const docState = state.docs[doc];
    if (docState.opsSinceSnapshot >= OPS_PER_SNAPSHOT) {
      void this.createSnapshot(boardId, doc, { auto: true });
      return;
    }
    if (docState.snapshotTimer) clearTimeout(docState.snapshotTimer);
    docState.snapshotTimer = setTimeout(
      () => void this.createSnapshot(boardId, doc, { auto: true }),
      SNAPSHOT_DEBOUNCE_MS,
    );
  }

  /**
   * Persist a full-state snapshot (version history + fast load), then prune ops
   * already folded into it. Also refreshes the notes text projection.
   */
  async createSnapshot(
    boardId: string,
    doc: DocType,
    opts: { label?: string; createdBy?: string | null; auto?: boolean } = {},
  ): Promise<string | null> {
    const state = this.boards.get(boardId);
    if (!state) return null;
    const docState = state.docs[doc];
    if (docState.snapshotTimer) {
      clearTimeout(docState.snapshotTimer);
      docState.snapshotTimer = undefined;
    }
    const encoded = Buffer.from(Y.encodeStateAsUpdate(docState.ydoc));
    const snapshot = await Snapshot.create({
      board: boardId,
      doc,
      state: encoded,
      label: opts.label ?? (opts.auto ? 'Autosave' : 'Manual snapshot'),
      createdBy: opts.createdBy ?? null,
      seq: docState.seq,
      auto: opts.auto ?? false,
    });
    docState.snapshotSeq = docState.seq;
    docState.opsSinceSnapshot = 0;
    // Compact: drop ops already captured by this snapshot (keep the log bounded).
    await BoardOp.deleteMany({ board: boardId, doc, seq: { $lte: docState.seq } });

    if (doc === 'notes') await this.persistNotesText(boardId, docState.ydoc);
    return snapshot.id;
  }

  private async persistNotesText(boardId: string, ydoc: Y.Doc): Promise<void> {
    const text = xmlFragmentToText(ydoc.getXmlFragment('default'));
    await Note.findOneAndUpdate({ board: boardId }, { text }, { upsert: true, new: true });
  }

  /** Live notes text if the board is loaded, else the persisted projection. */
  async getNotesText(boardId: string): Promise<string> {
    const state = this.boards.get(boardId);
    if (state) return xmlFragmentToText(state.docs.notes.ydoc.getXmlFragment('default'));
    const note = await Note.findOne({ board: boardId }).lean();
    return note?.text ?? '';
  }

  /** Replace a doc's contents with a snapshot's state (restore-to-snapshot). */
  async restoreSnapshot(
    boardId: string,
    snapshotDoc: {
      doc: DocType;
      state: Buffer;
    },
    restoredBy: string,
  ): Promise<string> {
    const state = await this.ensureLoaded(boardId);
    const docState = state.docs[snapshotDoc.doc];
    // Compute a diff update that transforms the current doc into the snapshot state,
    // so all connected clients converge without a hard reload.
    const target = new Y.Doc();
    Y.applyUpdate(target, bufToU8(snapshotDoc.state));
    const diff = Y.encodeStateAsUpdate(target, Y.encodeStateVector(docState.ydoc));
    const diffB64 = toB64(diff);
    // Reuse the normal update path so it persists + fans out to every client/node.
    await this.applyLocalUpdate(boardId, snapshotDoc.doc, diffB64, restoredBy);
    return diffB64;
  }

  private async unload(boardId: string): Promise<void> {
    const state = this.boards.get(boardId);
    if (!state || state.refs > 0) return;
    for (const doc of DOC_TYPES) {
      await this.createSnapshot(boardId, doc, { auto: true }).catch(() => undefined);
      state.docs[doc].ydoc.destroy();
    }
    this.boards.delete(boardId);
    logger.debug({ boardId }, 'board unloaded from memory');
  }

  /** Test/shutdown helper. */
  async flushAll(): Promise<void> {
    for (const [boardId, state] of this.boards) {
      for (const doc of DOC_TYPES) {
        if (state.docs[doc].snapshotTimer) clearTimeout(state.docs[doc].snapshotTimer);
      }
      await this.createSnapshot(boardId, 'canvas', { auto: true }).catch(() => undefined);
      await this.createSnapshot(boardId, 'notes', { auto: true }).catch(() => undefined);
    }
  }
}
