import { z } from 'zod';
import { ROLES, BOARD_SORT, LIMITS } from '../constants.js';

/**
 * Zod schemas used by the server's `validate()` middleware and re-exportable to
 * the client for form validation. Kept aligned with `types/dto.ts` by hand —
 * the DTO is the type-level contract, these are the runtime guards.
 */

const email = z.string().trim().toLowerCase().email();
const password = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX);
const roleSchema = z.enum(ROLES);

/* ── Auth ─────────────────────────────────────────────────────────────── */
export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(80),
});
export const loginSchema = z.object({ email, password: z.string().min(1) });
export const verifyEmailSchema = z.object({ token: z.string().min(10) });
export const forgotPasswordSchema = z.object({ email });

/* ── Workspaces ───────────────────────────────────────────────────────── */
export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.WORKSPACE_NAME_MAX),
});
export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.WORKSPACE_NAME_MAX).optional(),
});

/* ── Boards ───────────────────────────────────────────────────────────── */
export const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(LIMITS.BOARD_TITLE_MAX),
});
export const updateBoardSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.BOARD_TITLE_MAX).optional(),
  isArchived: z.boolean().optional(),
  thumbnail: z.string().nullable().optional(),
});
export const listBoardsSchema = z.object({
  workspaceId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  starred: z.coerce.boolean().optional(),
  sort: z.enum(BOARD_SORT).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const starBoardSchema = z.object({ starred: z.boolean() });

/* ── Members / invitations ────────────────────────────────────────────── */
export const inviteSchema = z.object({
  email,
  role: roleSchema,
  boardId: z.string().nullable().optional(),
});
export const acceptInvitationSchema = z.object({ token: z.string().min(10) });
export const updateMemberRoleSchema = z.object({ userId: z.string().min(1), role: roleSchema });

/* ── Share links ──────────────────────────────────────────────────────── */
export const createShareLinkSchema = z.object({
  ttlDays: z.number().int().min(1).max(LIMITS.SHARE_LINK_MAX_TTL_DAYS).nullable().optional(),
});

/* ── Version history ──────────────────────────────────────────────────── */
export const createSnapshotSchema = z.object({ label: z.string().trim().max(120).optional() });
export const restoreSnapshotSchema = z.object({ snapshotId: z.string().min(1) });

/* ── AI ───────────────────────────────────────────────────────────────── */
export const generateActionItemsSchema = z.object({ text: z.string().max(20000).optional() });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ListBoardsInput = z.infer<typeof listBoardsSchema>;
