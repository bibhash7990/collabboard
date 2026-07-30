import type { Role, BoardSort } from '../constants.js';
import type {
  Board,
  Invitation,
  Me,
  Note,
  ShareLink,
  Snapshot,
  User,
  Workspace,
  ActionItem,
} from './domain.js';

/** Standard error envelope returned by every failing REST + socket call. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level validation issues, when applicable. */
    details?: Array<{ path: string; message: string }>;
  };
}

/* ── Auth ─────────────────────────────────────────────────────────────── */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthResponse {
  user: Me;
  /** Short-lived access token (refresh token is set as an httpOnly cookie). */
  accessToken: string;
}
export interface VerifyEmailRequest {
  token: string;
}
export interface RefreshResponse {
  accessToken: string;
}

/* ── Workspaces ───────────────────────────────────────────────────────── */
export interface CreateWorkspaceRequest {
  name: string;
}
export interface UpdateWorkspaceRequest {
  name?: string;
}

/* ── Boards ───────────────────────────────────────────────────────────── */
export interface CreateBoardRequest {
  workspaceId: string;
  title: string;
}
export interface UpdateBoardRequest {
  title?: string;
  isArchived?: boolean;
  thumbnail?: string | null;
}
export interface ListBoardsQuery {
  workspaceId?: string;
  q?: string;
  starred?: boolean;
  sort?: BoardSort;
  page?: number;
  limit?: number;
}
export interface ListBoardsResponse {
  boards: Board[];
  total: number;
  page: number;
  limit: number;
}
export interface StarBoardRequest {
  starred: boolean;
}

/* ── Members / Invitations ────────────────────────────────────────────── */
export interface InviteRequest {
  email: string;
  role: Role;
  /** When set, invitation grants access to a single board; otherwise workspace-wide. */
  boardId?: string | null;
}
export interface AcceptInvitationRequest {
  token: string;
}
export interface UpdateMemberRoleRequest {
  userId: string;
  role: Role;
}

/* ── Share links ──────────────────────────────────────────────────────── */
export interface CreateShareLinkRequest {
  /** Days until expiry; omit/null for no expiry (capped server-side). */
  ttlDays?: number | null;
}
export interface PublicBoardResponse {
  board: Pick<Board, 'id' | 'title'>;
  /** base64 Yjs canvas state for read-only render. */
  canvasState: string;
  notesText: string;
  expiresAt: string | null;
}

/* ── Version history ──────────────────────────────────────────────────── */
export interface CreateSnapshotRequest {
  label?: string;
}
export interface RestoreSnapshotRequest {
  snapshotId: string;
}

/* ── AI action items ──────────────────────────────────────────────────── */
export interface GenerateActionItemsRequest {
  /** Optional override; defaults to the board's current notes text. */
  text?: string;
}
export interface GenerateActionItemsResponse {
  items: ActionItem[];
  model: string;
  generatedAt: string;
}

/* ── Convenience re-exports for API consumers ─────────────────────────── */
export type { Board, Invitation, Me, Note, ShareLink, Snapshot, User, Workspace, ActionItem };
