import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import * as Y from 'yjs';
import { BoardDocManager } from '../src/realtime/BoardDocManager';

/**
 * Regression: a fresh manager must rebuild a board from what's persisted in Mongo.
 * `.lean()` hands back a BSON Binary (not a Node Buffer), and a naive
 * `new Uint8Array(binary)` decodes to garbage → Yjs throws "Unexpected end of
 * array". This test exercises the exact DB-hydration path the public share
 * endpoint uses, for both the snapshot and op-log branches.
 */
function encodeElement(key: string, value: Record<string, unknown>): string {
  const doc = new Y.Doc();
  doc.getMap('elements').set(key, value);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
}

function decodeState(stateB64: string): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(stateB64, 'base64')));
  return doc;
}

describe('BoardDocManager DB hydration', () => {
  it('rehydrates a board from a persisted snapshot', async () => {
    const boardId = new mongoose.Types.ObjectId().toString();
    const writer = new BoardDocManager();
    await writer.applyLocalUpdate(boardId, 'canvas', encodeElement('e1', {
      id: 'e1',
      type: 'rectangle',
      x: 10,
      y: 20,
    }), null);
    await writer.createSnapshot(boardId, 'canvas', { auto: true }); // persists + compacts ops

    // Fresh instance → must read the stored snapshot back and decode it.
    const reader = new BoardDocManager();
    const rehydrated = decodeState(await reader.getState(boardId, 'canvas'));

    expect(rehydrated.getMap('elements').get('e1')).toMatchObject({ type: 'rectangle', x: 10 });
    await writer.flushAll();
    await reader.flushAll();
  });

  it('rehydrates from the op-log alone (no snapshot yet)', async () => {
    const boardId = new mongoose.Types.ObjectId().toString();
    const writer = new BoardDocManager();
    await writer.applyLocalUpdate(boardId, 'canvas', encodeElement('n1', {
      id: 'n1',
      type: 'sticky',
      text: 'hi',
    }), null);

    const reader = new BoardDocManager();
    const rehydrated = decodeState(await reader.getState(boardId, 'canvas'));

    expect(rehydrated.getMap('elements').get('n1')).toMatchObject({ text: 'hi' });
    await writer.flushAll();
    await reader.flushAll();
  });
});
