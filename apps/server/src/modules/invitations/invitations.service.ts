import type { Invitation as InvitationDTO } from '@collabboard/shared';
import { sha256 } from '../../utils/tokens';
import { ApiError } from '../../utils/ApiError';
import { Board, BoardMembership, Invitation, Workspace, WorkspaceMembership } from '../../models';
import { toInvitation } from '../../services/serialize';

/**
 * Invitation redemption logic, kept out of the controller so the accept path can
 * be reused (and unit-tested) independently of Express. Tokens are matched by
 * their SHA-256 hash — the plaintext is never stored.
 */

/** A preview enriches the sanitized invitation with the names it grants access to. */
export interface InvitationPreview extends InvitationDTO {
  workspaceName: string | null;
  boardName: string | null;
}

/**
 * Redeem a pending invitation for the authenticated caller: grant the workspace
 * (and, when board-scoped, the board) membership at the invited role, then mark
 * the invitation accepted. Returns the ids the client should navigate to.
 */
export async function acceptInvitation(
  userEmail: string,
  userId: string,
  token: string,
): Promise<{ workspaceId: string; boardId: string | null }> {
  const invitation = await Invitation.findOne({ tokenHash: sha256(token), status: 'pending' });
  if (!invitation) throw ApiError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');

  // Expired-but-still-pending rows: flip the status so the state stays truthful.
  if (invitation.expiresAt.getTime() < Date.now()) {
    invitation.status = 'expired';
    await invitation.save();
    throw ApiError.badRequest('Invitation has expired', 'INVITATION_EXPIRED');
  }

  // An invitation is bound to one email — don't let another account claim it.
  if (invitation.email !== userEmail.toLowerCase()) {
    throw ApiError.forbidden('This invitation was sent to a different email');
  }

  // Upsert so re-accepting is idempotent and an existing member just gets the new role.
  await WorkspaceMembership.updateOne(
    { workspace: invitation.workspace, user: userId },
    {
      $setOnInsert: { workspace: invitation.workspace, user: userId },
      $set: { role: invitation.role },
    },
    { upsert: true },
  );

  let boardId: string | null = null;
  if (invitation.board) {
    boardId = invitation.board.toString();
    await BoardMembership.updateOne(
      { board: invitation.board, user: userId },
      {
        $setOnInsert: {
          board: invitation.board,
          workspace: invitation.workspace,
          user: userId,
        },
        $set: { role: invitation.role },
      },
      { upsert: true },
    );
  }

  invitation.status = 'accepted';
  await invitation.save();

  return { workspaceId: invitation.workspace.toString(), boardId };
}

/**
 * Read-only preview for the accept-invite landing page. Rejects anything that is
 * not a live pending invitation so the UI can 404 cleanly, and never leaks the
 * token hash (the DTO mapper drops it).
 */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await Invitation.findOne({
    tokenHash: sha256(token),
    status: 'pending',
  }).lean();
  if (!invitation || new Date(invitation.expiresAt).getTime() < Date.now()) {
    throw ApiError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
  }

  const [workspace, board] = await Promise.all([
    Workspace.findById(invitation.workspace).select('name').lean(),
    invitation.board
      ? Board.findById(invitation.board).select('title').lean()
      : Promise.resolve(null),
  ]);

  return {
    ...toInvitation(invitation),
    workspaceName: workspace?.name ?? null,
    boardName: board?.title ?? null,
  };
}
