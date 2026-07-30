import type { Role, DocType, InvitationStatus, ShapeType } from '../constants.js';

/**
 * Domain entities as seen over the wire (ids are strings, dates are ISO strings).
 * Mongoose documents map onto these via `toJSON` transforms on the server.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  emailVerified: boolean;
  createdAt: string;
}

/** The authenticated user's own profile (superset of the public User). */
export interface Me extends User {
  updatedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  role: Role;
  /** Denormalized for list views; may be omitted on write paths. */
  user?: Pick<User, 'id' | 'name' | 'email' | 'avatarColor'>;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members: WorkspaceMember[];
  createdAt: string;
  updatedAt: string;
}

export interface BoardMember {
  userId: string;
  role: Role;
  user?: Pick<User, 'id' | 'name' | 'email' | 'avatarColor'>;
}

export interface Board {
  id: string;
  workspaceId: string;
  title: string;
  ownerId: string;
  members: BoardMember[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Per-requesting-user metadata, populated by list/detail endpoints. */
  starred?: boolean;
  lastOpenedAt?: string | null;
  /** Effective role of the requesting user on this board. */
  myRole?: Role;
  /** data: URL thumbnail captured on save (optional). */
  thumbnail?: string | null;
}

/** Append-only CRDT update log entry (op-log side of op-log-vs-snapshot). */
export interface BoardOp {
  id: string;
  boardId: string;
  doc: DocType;
  /** base64-encoded Yjs update. */
  update: string;
  seq: number;
  actorId: string;
  createdAt: string;
}

/** Version-history snapshot (full encoded Yjs state for a doc). */
export interface Snapshot {
  id: string;
  boardId: string;
  doc: DocType;
  /** base64-encoded Y.encodeStateAsUpdate. */
  state: string;
  label: string;
  createdBy: string;
  createdAt: string;
  /** Byte size, surfaced in the history UI. */
  size: number;
}

export interface Note {
  id: string;
  boardId: string;
  /** Latest plain-text projection of the Tiptap doc, for search + AI. */
  text: string;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  boardId: string | null;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  boardId: string;
  /** Opaque token embedded in the public URL. */
  token: string;
  mode: 'view';
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  revoked: boolean;
}

/** A single AI-extracted action item from the meeting notes. */
export interface ActionItem {
  id: string;
  text: string;
  owner: string | null;
  due: string | null;
  confidence: number;
}

/** A canvas element as stored inside the Yjs `canvas` Y.Map (documented for clients). */
export interface CanvasElement {
  id: string;
  type: ShapeType;
  /** For pen/line/arrow: flat [x0,y0,x1,y1,...]. For shapes/sticky/text: bounding box. */
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
