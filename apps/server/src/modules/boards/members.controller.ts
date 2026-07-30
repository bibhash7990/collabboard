import { Types } from 'mongoose';
import type { InviteRequest, StarBoardRequest, UpdateMemberRoleRequest } from '@collabboard/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { requireBoardRole } from '../../services/access';
import { toBoardMember, toInvitation } from '../../services/serialize';
import { BoardMembership, Invitation } from '../../models';
import { emitKicked, emitRoleChanged } from '../../realtime/gateway';
import { randomToken, sha256 } from '../../utils/tokens';
import { invitationEmail, sendMail } from '../../utils/email';
import { env } from '../../config/env';

const INVITE_TTL_DAYS = 14;

/** Toggle the caller's personal "starred" flag on a board — viewer+. */
export const star = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { starred } = req.body as StarBoardRequest;
  await requireBoardRole(userId, boardId, 'viewer');
  await BoardMembership.updateOne({ board: boardId, user: userId }, { $set: { starred } });
  res.json({ starred });
});

/** List a board's members with populated user profiles — viewer+. */
export const listMembers = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  await requireBoardRole(userId, boardId, 'viewer');
  const members = await BoardMembership.find({ board: boardId })
    .populate('user', 'name email avatarColor')
    .lean();
  res.json({ members: members.map(toBoardMember) });
});

/** Invite someone to this specific board (editor+). Always a pending invitation. */
export const invite = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const boardId = req.params.id;
  const { email, role } = req.body as InviteRequest;
  const { board } = await requireBoardRole(userId, boardId, 'editor');

  // Store only the hash; the raw token lives solely in the emailed link.
  const raw = randomToken();
  const invitation = await Invitation.create({
    workspace: board.workspace,
    board: board._id,
    email,
    role,
    tokenHash: sha256(raw),
    invitedBy: userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  });

  const link = `${env.CLIENT_URL}/accept-invite/${raw}`;
  await sendMail({ ...invitationEmail(req.user!.name, board.title, link), to: email });

  res.status(201).json({ invitation: toInvitation(invitation) });
});

/** Change a member's role (owner only), then push the change to their live sockets. */
export const updateMemberRole = asyncHandler(async (req, res) => {
  const callerId = req.user!.id;
  const boardId = req.params.id;
  const { userId, role } = req.body as UpdateMemberRoleRequest;
  await requireBoardRole(callerId, boardId, 'owner');

  if (!Types.ObjectId.isValid(userId))
    throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
  const target = await BoardMembership.findOne({ board: boardId, user: userId });
  if (!target) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');

  // Never let the board end up with zero owners.
  if (target.role === 'owner' && role !== 'owner') {
    const owners = await BoardMembership.countDocuments({ board: boardId, role: 'owner' });
    if (owners <= 1) throw ApiError.badRequest('Cannot demote the last owner', 'LAST_OWNER');
  }

  target.role = role;
  await target.save();
  await target.populate('user', 'name email avatarColor');
  emitRoleChanged(boardId, userId, role);

  res.json({ member: toBoardMember(target) });
});

/** Remove a member (owner only), then force their live sockets out of the board. */
export const removeMember = asyncHandler(async (req, res) => {
  const callerId = req.user!.id;
  const boardId = req.params.id;
  const userId = req.params.userId;
  await requireBoardRole(callerId, boardId, 'owner');

  if (!Types.ObjectId.isValid(userId))
    throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');
  const target = await BoardMembership.findOne({ board: boardId, user: userId });
  if (!target) throw ApiError.notFound('Member not found', 'MEMBER_NOT_FOUND');

  if (target.role === 'owner') {
    const owners = await BoardMembership.countDocuments({ board: boardId, role: 'owner' });
    if (owners <= 1) throw ApiError.badRequest('Cannot remove the last owner', 'LAST_OWNER');
  }

  await target.deleteOne();
  emitKicked(boardId, userId);

  res.status(204).send();
});
