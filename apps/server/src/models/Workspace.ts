import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '@collabboard/shared';
import { jsonTransform } from './_helpers';

export interface IWorkspace {
  name: string;
  owner: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
export type WorkspaceDoc = HydratedDocument<IWorkspace>;

const workspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, toJSON: jsonTransform() },
);

export const Workspace = model<IWorkspace>('Workspace', workspaceSchema);

/** Normalized membership → efficient "workspaces for user" queries. */
export interface IWorkspaceMembership {
  workspace: Types.ObjectId;
  user: Types.ObjectId;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
export type WorkspaceMembershipDoc = HydratedDocument<IWorkspaceMembership>;

const wsMembershipSchema = new Schema<IWorkspaceMembership>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true, toJSON: jsonTransform() },
);
wsMembershipSchema.index({ workspace: 1, user: 1 }, { unique: true });

export const WorkspaceMembership = model<IWorkspaceMembership>(
  'WorkspaceMembership',
  wsMembershipSchema,
);
