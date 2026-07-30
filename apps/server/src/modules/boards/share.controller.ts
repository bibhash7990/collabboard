import { Types } from 'mongoose';
import type { CreateShareLinkRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { requireBoardRole } from '../../services/access';
import { toShareLink } from '../../services/serialize';
import { ShareLink } from '../../models';
import { randomToken, sha256 } from '../../utils/tokens';
import { env } from '../../config/env';

/** List a board's share links — editor+. Includes the token so links stay copyable. */
export const listLinks = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  await requireBoardRole(userId, boardId, 'editor');
  const links = await ShareLink.find({ board: boardId }).sort({ createdAt: -1 }).lean();
  res.json({ links: links.map((link) => toShareLink(link, link.token)) });
});

/**
 * Mint a read-only share link — editor+. Stores the token (for re-copy by editors)
 * plus its sha256 (the public-lookup index). `ttlDays` is capped by the schema;
 * omit/null means no expiry.
 */
export const createLink = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { ttlDays } = req.body as CreateShareLinkRequest;
  await requireBoardRole(userId, boardId, 'editor');

  const raw = randomToken();
  const expiresAt =
    typeof ttlDays === 'number' ? new Date(Date.now() + ttlDays * 86_400_000) : null;
  const link = await ShareLink.create({
    board: boardId,
    token: raw,
    tokenHash: sha256(raw),
    createdBy: userId,
    expiresAt,
  });

  res.status(201).json({
    link: toShareLink(link, raw),
    url: `${env.CLIENT_URL}/share/${raw}`,
  });
});

/** Revoke a share link — editor+. Idempotent flag flip; the token stays unusable. */
export const revokeLink = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const linkId = req.params.linkId;
  await requireBoardRole(userId, boardId, 'editor');

  if (!Types.ObjectId.isValid(linkId))
    throw ApiError.notFound('Share link not found', 'SHARE_LINK_NOT_FOUND');
  const result = await ShareLink.updateOne(
    { _id: linkId, board: boardId },
    { $set: { revoked: true } },
  );
  if (result.matchedCount === 0)
    throw ApiError.notFound('Share link not found', 'SHARE_LINK_NOT_FOUND');

  res.status(204).send();
});
