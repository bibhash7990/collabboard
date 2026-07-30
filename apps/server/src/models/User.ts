import { Schema, model, type HydratedDocument } from 'mongoose';
import { colorForId } from '@collabboard/shared';
import { jsonTransform } from './_helpers';

export interface IUser {
  email: string;
  name: string;
  passwordHash: string;
  avatarColor: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDoc = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    avatarColor: { type: String, default: '' },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: jsonTransform('passwordHash') },
);

userSchema.pre('save', function assignColor(next) {
  if (!this.avatarColor) this.avatarColor = colorForId(this._id.toString());
  next();
});

export const User = model<IUser>('User', userSchema);
