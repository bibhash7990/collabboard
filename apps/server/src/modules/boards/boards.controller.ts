import { Types, type PipelineStage } from 'mongoose';
import type { BoardSort, CreateBoardRequest, Role, UpdateBoardRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { requireBoardRole, requireWorkspaceRole } from '../../services/access';
import { toBoard } from '../../services/serialize';
import {
  Board,
  BoardMembership,
  BoardOp,
  Note,
  ShareLink,
  Snapshot,
  Workspace,
  type BoardDoc,
} from '../../models';

/** Escape a user string so it can be safely embedded in a case-insensitive RegExp. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One aggregation row: the caller's membership fields plus the joined board. */
interface BoardListRow {
  role: Role;
  starred: boolean;
  lastOpenedAt: Date | null;
  board: Record<string, unknown>;
  owner?: Record<string, unknown>;
}

/**
 * List the caller's boards. The access list *is* their BoardMembership rows, so we
 * drive the whole thing from a single aggregation: membership → board (→ owner only
 * when searching by name) → sort → $facet for total + page. This avoids the N+1 of
 * "fetch memberships, then fetch each board" and keeps pagination server-side.
 */
export const list = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const query = req.query as unknown as {
    workspaceId?: string;
    q?: string;
    starred?: boolean;
    sort?: BoardSort;
    page: number;
    limit: number;
  };
  const { q, starred, sort = 'lastOpened', page, limit } = query;

  // Pre-lookup match hits BoardMembership indexes (user / user+starred / workspace).
  const match: Record<string, unknown> = { user: new Types.ObjectId(userId) };
  if (typeof starred === 'boolean') match.starred = starred;
  if (query.workspaceId) {
    // A malformed id can't match anything — short-circuit instead of casting/throwing.
    if (!Types.ObjectId.isValid(query.workspaceId)) {
      res.json({ boards: [], total: 0, page, limit });
      return;
    }
    match.workspace = new Types.ObjectId(query.workspaceId);
  }

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $lookup: { from: 'boards', localField: 'board', foreignField: '_id', as: 'board' } },
    { $unwind: '$board' },
    // Owner is a single indexed _id join — kept so the card can show the owner name
    // and so `q` can search by owner as well as title.
    { $lookup: { from: 'users', localField: 'board.owner', foreignField: '_id', as: 'owner' } },
    { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
  ];

  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    pipeline.push({ $match: { $or: [{ 'board.title': rx }, { 'owner.name': rx }] } });
  }

  const sortMap: Record<BoardSort, Record<string, 1 | -1>> = {
    lastOpened: { lastOpenedAt: -1, _id: 1 },
    created: { 'board.createdAt': -1, _id: 1 },
    updated: { 'board.updatedAt': -1, _id: 1 },
    title: { 'board.title': 1, _id: 1 },
  };

  pipeline.push(
    { $sort: sortMap[sort] },
    {
      $facet: {
        total: [{ $count: 'count' }],
        page: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  );

  const [facet] = await BoardMembership.aggregate<{
    total: { count: number }[];
    page: BoardListRow[];
  }>(pipeline);

  const total = facet?.total[0]?.count ?? 0;
  const rows = facet?.page ?? [];
  // List rows carry only the owner (not every member) plus the caller's metadata.
  const boards = rows.map((row) =>
    toBoard(row.board, {
      members: row.owner ? [{ user: row.owner, role: 'owner' as Role }] : [],
      myRole: row.role,
      starred: row.starred,
      lastOpenedAt: row.lastOpenedAt,
    }),
  );

  res.json({ boards, total, page, limit });
});

/** Load the full board DTO (populated members + the caller's own metadata). */
async function boardDetail(board: BoardDoc, boardId: string, userId: string, role: Role) {
  const [members, mine] = await Promise.all([
    BoardMembership.find({ board: boardId }).populate('user', 'name email avatarColor').lean(),
    BoardMembership.findOne({ board: boardId, user: userId }).select('starred lastOpenedAt').lean(),
  ]);
  return toBoard(board, {
    members,
    myRole: role,
    starred: Boolean(mine?.starred),
    lastOpenedAt: mine?.lastOpenedAt ?? null,
  });
}

/**
 * Create a board inside a workspace. The creator becomes owner, and the workspace
 * owner is added as a co-owner (so the person who owns the space never loses access
 * to boards created inside it). An empty Note backs the meeting-notes projection.
 */
export const create = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { workspaceId, title } = req.body as CreateBoardRequest;

  if (!Types.ObjectId.isValid(workspaceId))
    throw ApiError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
  await requireWorkspaceRole(userId, workspaceId, 'editor');

  const board = await Board.create({ workspace: workspaceId, title, owner: userId });
  const members: { user: string; role: Role }[] = [{ user: userId, role: 'owner' }];

  await BoardMembership.create({
    board: board._id,
    workspace: board.workspace,
    user: userId,
    role: 'owner',
  });

  const ws = await Workspace.findById(workspaceId).select('owner').lean();
  if (ws && ws.owner.toString() !== userId) {
    await BoardMembership.create({
      board: board._id,
      workspace: board.workspace,
      user: ws.owner,
      role: 'owner',
    });
    members.push({ user: ws.owner.toString(), role: 'owner' });
  }

  await Note.create({ board: board._id, text: '' });

  res.status(201).json({ board: toBoard(board, { members, myRole: 'owner' }) });
});

/** Board detail — viewer+; also records "last opened" for the dashboard's recency sort. */
export const get = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { board, role } = await requireBoardRole(userId, boardId, 'viewer');
  const detail = await boardDetail(board, boardId, userId, role);
  await BoardMembership.updateOne(
    { board: boardId, user: userId },
    { $set: { lastOpenedAt: new Date() } },
  );
  res.json({ board: detail });
});

/** Update mutable board fields — editor+. */
export const update = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const body = req.body as UpdateBoardRequest;
  const { board, role } = await requireBoardRole(userId, boardId, 'editor');

  if (body.title !== undefined) board.title = body.title;
  if (body.isArchived !== undefined) board.isArchived = body.isArchived;
  if (body.thumbnail !== undefined) board.thumbnail = body.thumbnail;
  await board.save();

  res.json({ board: await boardDetail(board, boardId, userId, role) });
});

/** Delete a board — owner only. Cascades every dependent collection. */
export const remove = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  await requireBoardRole(userId, boardId, 'owner');

  await Promise.all([
    BoardMembership.deleteMany({ board: boardId }),
    Note.deleteMany({ board: boardId }),
    BoardOp.deleteMany({ board: boardId }),
    Snapshot.deleteMany({ board: boardId }),
    ShareLink.deleteMany({ board: boardId }),
    Board.deleteOne({ _id: boardId }),
  ]);

  res.status(204).send();
});
