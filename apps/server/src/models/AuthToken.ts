import { Schema, model, Types, type HydratedDocument } from 'mongoose';

/** Rotating refresh tokens — stored hashed so a DB leak can't mint sessions. */
export interface IRefreshToken {
  user: Types.ObjectId;
  jti: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
}
export type RefreshTokenDoc = HydratedDocument<IRefreshToken>;

const refreshSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: String,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// TTL: Mongo purges expired tokens automatically.
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshSchema);

/** Single-use tokens for email verification and password reset. */
export interface IEmailToken {
  user: Types.ObjectId;
  tokenHash: string;
  type: 'verify' | 'reset';
  expiresAt: Date;
  createdAt: Date;
}
export type EmailTokenDoc = HydratedDocument<IEmailToken>;

const emailTokenSchema = new Schema<IEmailToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    type: { type: String, enum: ['verify', 'reset'], required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailToken = model<IEmailToken>('EmailToken', emailTokenSchema);
