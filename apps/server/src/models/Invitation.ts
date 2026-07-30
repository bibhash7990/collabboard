import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { ROLES, INVITATION_STATUS, type Role, type InvitationStatus } from '@collabboard/shared';
import { jsonTransform } from './_helpers';

export interface IInvitation {
  workspace: Types.ObjectId;
  board: Types.ObjectId | null;
  email: string;
  role: Role;
  status: InvitationStatus;
  tokenHash: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export type InvitationDoc = HydratedDocument<IInvitation>;

const invitationSchema = new Schema<IInvitation>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    board: { type: Schema.Types.ObjectId, ref: 'Board', default: null },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: INVITATION_STATUS, default: 'pending', index: true },
    tokenHash: { type: String, required: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, toJSON: jsonTransform('tokenHash') },
);

export const Invitation = model<IInvitation>('Invitation', invitationSchema);
