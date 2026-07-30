import { hasAtLeastRole, type Role } from '@collabboard/shared';
import { Board, BoardMembership, WorkspaceMembership, type BoardDoc } from '../models';
import { ApiError } from '../utils/ApiError';

/**
 * Central authorization service. Both the REST controllers and the Socket.IO
 * gateway call through here — there is exactly one definition of "can this user
 * do X on this board", so a socket event can never be less strict than its REST
 * equivalent.
 */

export async function getWorkspaceRole(userId: string, workspaceId: string): Promise<Role | null> {
  const m = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId })
    .select('role')
    .lean();
  return (m?.role as Role) ?? null;
}

export async function getBoardRole(userId: string, boardId: string): Promise<Role | null> {
  const m = await BoardMembership.findOne({ board: boardId, user: userId }).select('role').lean();
  return (m?.role as Role) ?? null;
}

/** Assert the user holds at least `required` on the workspace, else throw. */
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  required: Role,
): Promise<Role> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) throw ApiError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
  if (!hasAtLeastRole(role, required))
    throw ApiError.forbidden(`Requires workspace role '${required}'`);
  return role;
}

/**
 * Assert the user holds at least `required` on the board, else throw.
 * Returns the loaded board + the caller's effective role for reuse.
 */
export async function requireBoardRole(
  userId: string,
  boardId: string,
  required: Role,
): Promise<{ board: BoardDoc; role: Role }> {
  const role = await getBoardRole(userId, boardId);
  // 404 (not 403) when the user has no access at all — don't leak board existence.
  if (!role) throw ApiError.notFound('Board not found', 'BOARD_NOT_FOUND');
  const board = await Board.findById(boardId);
  if (!board) throw ApiError.notFound('Board not found', 'BOARD_NOT_FOUND');
  if (!hasAtLeastRole(role, required))
    throw ApiError.forbidden(`Requires board role '${required}'`);
  return { board, role };
}

/** Non-throwing check used by the socket gateway's fast path. */
export async function checkBoardRole(
  userId: string,
  boardId: string,
  required: Role,
): Promise<Role | null> {
  const role = await getBoardRole(userId, boardId);
  if (!role || !hasAtLeastRole(role, required)) return null;
  return role;
}
