import type { ToObjectOptions } from 'mongoose';

/** Rename `_id` → `id`, drop `__v`, and strip any listed sensitive fields. */
export function jsonTransform(...strip: string[]): ToObjectOptions {
  return {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = ret._id?.toString();
      delete ret._id;
      for (const key of strip) delete ret[key];
      return ret;
    },
  };
}
