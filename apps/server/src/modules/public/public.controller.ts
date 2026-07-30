import type { Request } from 'express';
import type { PublicBoardResponse } from '@collabboard/shared';
import { Board, ShareLink } from '../../models';
import { boardDocs } from '../../realtime/manager';
import { sha256 } from '../../utils/tokens';
import { ApiError } from '../../utils/ApiError';

/**
 * Unauthenticated, read-only view of a board behind a share token.
 * The plaintext token never touches the DB — we resolve the link by its sha256
 * digest, the same hash stored when the link was minted, so a leaked database
 * can't reconstruct usable URLs.
 */
export async function getPublicBoard(req: Request): Promise<PublicBoardResponse> {
  const tokenHash = sha256(req.params.token);
  const link = await ShareLink.findOne({ tokenHash }).lean();
  // Missing and revoked collapse to the same 404 so a guessed/rotated token
  // leaks nothing about whether a board ever sat behind it.
  if (!link || link.revoked)
    throw ApiError.notFound('Share link not found', 'SHARE_LINK_NOT_FOUND');
  // Expired links are Gone (410), distinct from never-existed, so the client can
  // render a precise "this link has expired" state instead of a generic 404.
  if (link.expiresAt && link.expiresAt.getTime() < Date.now())
    throw new ApiError(410, 'SHARE_LINK_EXPIRED', 'This share link has expired');

  const boardId = link.board.toString();
  const board = await Board.findById(boardId).lean();
  if (!board) throw ApiError.notFound('Board not found', 'BOARD_NOT_FOUND');

  // Pull live CRDT state straight from the authoritative doc manager so the public
  // snapshot always matches what editors currently see.
  return {
    board: { id: boardId, title: board.title },
    canvasState: await boardDocs.getState(boardId, 'canvas'),
    notesText: await boardDocs.getNotesText(boardId),
    expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
  };
}
