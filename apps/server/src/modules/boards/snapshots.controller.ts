import { Types } from 'mongoose';
import { SOCKET_EVENTS, type CreateSnapshotRequest, type RestoreSnapshotRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { requireBoardRole } from '../../services/access';
import { toSnapshot } from '../../services/serialize';
import { Snapshot } from '../../models';
import { boardDocs } from '../../realtime/manager';
import { getIo } from '../../realtime/gateway';
import { boardRoom } from '../../realtime/socketTypes';

/** Version history for a board — viewer+. Newest first, both sub-documents. */
export const listSnapshots = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  await requireBoardRole(userId, boardId, 'viewer');
  const snapshots = await Snapshot.find({ board: boardId }).sort({ createdAt: -1 }).lean();
  res.json({ snapshots: snapshots.map(toSnapshot) });
});

/**
 * Capture a labelled snapshot of both docs — editor+. We pin the board in memory
 * first so the snapshot works even when no socket currently has it open (the doc
 * manager only snapshots boards it has hydrated).
 */
export const createSnapshot = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { label } = req.body as CreateSnapshotRequest;
  await requireBoardRole(userId, boardId, 'editor');

  await boardDocs.acquire(boardId);
  try {
    const snapshotId = await boardDocs.createSnapshot(boardId, 'canvas', {
      label,
      createdBy: userId,
    });
    await boardDocs.createSnapshot(boardId, 'notes', { label, createdBy: userId });
    res.status(201).json({ snapshotId: snapshotId ?? '' });
  } finally {
    boardDocs.release(boardId);
  }
});

/** Restore a doc to a stored snapshot — editor+. The diff fans out to every client. */
export const restoreSnapshot = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { snapshotId } = req.body as RestoreSnapshotRequest;
  await requireBoardRole(userId, boardId, 'editor');

  if (!Types.ObjectId.isValid(snapshotId))
    throw ApiError.notFound('Snapshot not found', 'SNAPSHOT_NOT_FOUND');
  const snap = await Snapshot.findOne({ _id: snapshotId, board: boardId });
  if (!snap) throw ApiError.notFound('Snapshot not found', 'SNAPSHOT_NOT_FOUND');

  await boardDocs.acquire(boardId);
  try {
    const update = await boardDocs.restoreSnapshot(boardId, { doc: snap.doc, state: snap.state }, userId);
    // Fan the reconciling delta out to every connected client (adapter spans nodes).
    getIo()
      ?.to(boardRoom(boardId))
      .emit(SOCKET_EVENTS.YJS_BROADCAST, { boardId, doc: snap.doc, update });
    res.status(200).json({ ok: true });
  } finally {
    boardDocs.release(boardId);
  }
});
