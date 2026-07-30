/**
 * Cross-cutting constants shared by client and server.
 * Kept dependency-free so both bundlers can tree-shake freely.
 */

/** Access roles, ordered by privilege (viewer < editor < owner). */
export const ROLES = ['viewer', 'editor', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Numeric rank used for `hasAtLeast(role, required)` comparisons. */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

/** True when `role` is at least as privileged as `required`. */
export function hasAtLeastRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** The two CRDT sub-documents that live inside every board. */
export const DOC_TYPES = ['canvas', 'notes'] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Canvas primitive kinds the toolbar can create. */
export const SHAPE_TYPES = [
  'pen',
  'rectangle',
  'ellipse',
  'line',
  'arrow',
  'text',
  'sticky',
] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

/** Invitation lifecycle. */
export const INVITATION_STATUS = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUS)[number];

/** Deterministic palette for presence cursors / avatars. */
export const PRESENCE_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
] as const;

/** Pick a stable color for a user id (same id → same color everywhere). */
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

/** Board-list sort options exposed by the API. */
export const BOARD_SORT = ['lastOpened', 'created', 'updated', 'title'] as const;
export type BoardSort = (typeof BOARD_SORT)[number];

export const LIMITS = {
  WORKSPACE_NAME_MAX: 80,
  BOARD_TITLE_MAX: 120,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  SHARE_LINK_MAX_TTL_DAYS: 30,
  CURSOR_THROTTLE_MS: 40,
} as const;
