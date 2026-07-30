import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { jsonTransform } from './_helpers';

export interface IShareLink {
  board: Types.ObjectId;
  /** Raw token, kept so editors can re-copy the link (view-only, low-value). */
  token: string;
  /** sha256(token) — the index the public endpoint resolves against. */
  tokenHash: string;
  mode: 'view';
  expiresAt: Date | null;
  createdBy: Types.ObjectId;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type ShareLinkDoc = HydratedDocument<IShareLink>;

const shareLinkSchema = new Schema<IShareLink>(
  {
    board: { type: Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
    token: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    mode: { type: String, enum: ['view'], default: 'view' },
    expiresAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: jsonTransform('tokenHash') },
);

export const ShareLink = model<IShareLink>('ShareLink', shareLinkSchema);
