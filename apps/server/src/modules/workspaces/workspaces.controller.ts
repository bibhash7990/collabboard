import type { Role, UpdateMemberRoleRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { randomToken, sha256 } from '../../utils/tokens';
import { invitationEmail, sendMail } from '../../utils/email';
import {
  Board,
  BoardMembership,
  BoardOp,
  Invitation,
  Note,
  Snapshot,
  ShareLink,
  Workspace,
  WorkspaceMembership,
} from '../../models';
import { requireWorkspaceRole } from '../../services/access';
import { toInvitation, toWorkspace, toWorkspaceMember } from '../../services/serialize';

/**
 * Workspace REST surface. Membership rows (not an embedded array) are the source
 * of truth for access, so every handler routes its authorization through
 * `services/access` and reads/writes `WorkspaceMembership` directly.
 */

/** Invitations live for seven days before a fresh link is required. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Populate just the public user fields the DTO mappers expect. */
const USER_FIELDS = 'name email avatarColor';

/** GET /workspaces — every workspace the caller is a member of, members populated. */
export const list = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  // The caller's membership rows are the access list — no cross-workspace scan.
  const mine = await WorkspaceMembership.find({ user: userId }).select('workspace').lean();
  const workspaceIds = mine.map((m) => m.workspace);

  const [workspaces, memberships] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds } })
      .sort({ createdAt: 1 })
      .lean(),
    WorkspaceMembership.find({ workspace: { $in: workspaceIds } })
      .populate('user', USER_FIELDS)
      .lean(),
  ]);

  // Group memberships by workspace so each DTO carries its full member list.
  const byWorkspace = new Map<string, Array<{ user: unknown; role: Role }>>();
  for (const m of memberships) {
    const key = String(m.workspace);
    const rows = byWorkspace.get(key) ?? [];
    rows.push({ user: m.user, role: m.role });
    byWorkspace.set(key, rows);
  }

  res.json({
    workspaces: workspaces.map((w) => toWorkspace(w, byWorkspace.get(String(w._id)) ?? [])),
  });
});

/** POST /workspaces — create a workspace; the caller becomes its owner member. */
export const create = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { name } = req.body as { name: string };

  const workspace = await Workspace.create({ name, owner: userId });
  await WorkspaceMembership.create({ workspace: workspace._id, user: userId, role: 'owner' });

  const members = await WorkspaceMembership.find({ workspace: workspace._id })
    .populate('user', USER_FIELDS)
    .lean();
  res.status(201).json({ workspace: toWorkspace(workspace, members) });
});

/** GET /workspaces/:id — full workspace (require viewer). */
export const get = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  await requireWorkspaceRole(userId, workspaceId, 'viewer');

  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw ApiError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
  const members = await WorkspaceMembership.find({ workspace: workspaceId })
    .populate('user', USER_FIELDS)
    .lean();
  res.json({ workspace: toWorkspace(workspace, members) });
});

/** PATCH /workspaces/:id — rename (require owner). */
export const update = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  await requireWorkspaceRole(userId, workspaceId, 'owner');

  const { name } = req.body as { name?: string };
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;

  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $set: patch },
    { new: true },
  ).lean();
  if (!workspace) throw ApiError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
  const members = await WorkspaceMembership.find({ workspace: workspaceId })
    .populate('user', USER_FIELDS)
    .lean();
  res.json({ workspace: toWorkspace(workspace, members) });
});

/** DELETE /workspaces/:id — remove the workspace and cascade its dependents (require owner). */
export const remove = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  await requireWorkspaceRole(userId, workspaceId, 'owner');

  // Board-scoped children key off board ids, so resolve the workspace's boards first.
  const boards = await Board.find({ workspace: workspaceId }).select('_id').lean();
  const boardIds = boards.map((b) => b._id);

  await Promise.all([
    BoardMembership.deleteMany({ workspace: workspaceId }),
    Note.deleteMany({ board: { $in: boardIds } }),
    BoardOp.deleteMany({ board: { $in: boardIds } }),
    Snapshot.deleteMany({ board: { $in: boardIds } }),
    // Purge share links + pending invitations too, else they dangle past the workspace.
    ShareLink.deleteMany({ board: { $in: boardIds } }),
    Invitation.deleteMany({ workspace: workspaceId }),
  ]);
  await Board.deleteMany({ workspace: workspaceId });
  await Workspace.findByIdAndDelete(workspaceId);
  res.status(204).end();
});

/** GET /workspaces/:id/members — member list (require viewer). */
export const members = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  await requireWorkspaceRole(userId, workspaceId, 'viewer');

  const rows = await WorkspaceMembership.find({ workspace: workspaceId })
    .populate('user', USER_FIELDS)
    .lean();
  res.json({ members: rows.map((m) => toWorkspaceMember(m)) });
});

/** POST /workspaces/:id/invitations — invite by email (require editor). */
export const invite = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  await requireWorkspaceRole(userId, workspaceId, 'editor');

  const { email, role, boardId } = req.body as {
    email: string;
    role: Role;
    boardId?: string | null;
  };

  // Persist only the hash; the raw token exists solely inside the emailed link.
  const raw = randomToken();
  const invitation = await Invitation.create({
    workspace: workspaceId,
    board: boardId ?? null,
    email,
    role,
    status: 'pending',
    tokenHash: sha256(raw),
    invitedBy: userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  // A board-scoped invite reads better named after the board; else the workspace.
  const [workspace, board] = await Promise.all([
    Workspace.findById(workspaceId).select('name').lean(),
    boardId ? Board.findById(boardId).select('title').lean() : Promise.resolve(null),
  ]);
  const resource = board?.title ?? workspace?.name ?? 'a workspace';
  const link = `${env.CLIENT_URL}/accept-invite/${raw}`;
  await sendMail({ ...invitationEmail(req.user!.name, resource, link), to: email });

  res.status(201).json({ invitation: toInvitation(invitation) });
});

/** PATCH /workspaces/:id/members — change a member's role (require owner). */
export const updateMemberRole = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  await requireWorkspaceRole(userId, workspaceId, 'owner');

  const { userId: targetId, role } = req.body as UpdateMemberRoleRequest;
  const membership = await WorkspaceMembership.findOneAndUpdate(
    { workspace: workspaceId, user: targetId },
    { $set: { role } },
    { new: true },
  )
    .populate('user', USER_FIELDS)
    .lean();
  if (!membership) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
  res.json({ member: toWorkspaceMember(membership) });
});

/** DELETE /workspaces/:id/members/:userId — remove a member (require owner; keep ≥1 owner). */
export const removeMember = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const workspaceId = req.params.id;
  const targetId = req.params.userId;
  await requireWorkspaceRole(userId, workspaceId, 'owner');

  const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: targetId });
  if (!membership) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');

  // Refuse to strip the final owner — a workspace must always have one.
  if (membership.role === 'owner') {
    const owners = await WorkspaceMembership.countDocuments({
      workspace: workspaceId,
      role: 'owner',
    });
    if (owners <= 1) throw ApiError.badRequest('Cannot remove the last owner', 'LAST_OWNER');
  }

  await membership.deleteOne();
  res.status(204).end();
});
