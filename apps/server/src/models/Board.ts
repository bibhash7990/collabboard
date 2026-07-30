import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '@collabboard/shared';
import { jsonTransform } from './_helpers';

export interface IBoard {
  workspace: Types.ObjectId;
  title: string;
  owner: Types.ObjectId;
  isArchived: boolean;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type BoardDoc = HydratedDocument<IBoard>;

const boardSchema = new Schema<IBoard>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isArchived: { type: Boolean, default: false },
    thumbnail: { type: String, default: null },
  },
  { timestamps: true, toJSON: jsonTransform() },
);
// Text index powers "search by title"; owner search is handled via aggregation.
boardSchema.index({ title: 'text' });

export const Board = model<IBoard>('Board', boardSchema);

/**
 * Per-user board state: membership role + the "starred" flag + "last opened".
 * One row per (board, user) — this is what makes the board list cheap to build.
 */
export interface IBoardMembership {
  board: Types.ObjectId;
  workspace: Types.ObjectId;
  user: Types.ObjectId;
  role: Role;
  starred: boolean;
  lastOpenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type BoardMembershipDoc = HydratedDocument<IBoardMembership>;

const boardMembershipSchema = new Schema<IBoardMembership>(
  {
    board: { type: Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
    starred: { type: Boolean, default: false },
    lastOpenedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonTransform() },
);
boardMembershipSchema.index({ board: 1, user: 1 }, { unique: true });
boardMembershipSchema.index({ user: 1, starred: 1 });
boardMembershipSchema.index({ user: 1, lastOpenedAt: -1 });

export const BoardMembership = model<IBoardMembership>('BoardMembership', boardMembershipSchema);
