import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { DOC_TYPES, type DocType } from '@collabboard/shared';
import { jsonTransform } from './_helpers';

/**
 * Append-only CRDT operation log. Every applied Yjs update is persisted here so
 * a board can be reconstructed from `snapshot + ops-since`. This is the "ops"
 * half of the ops-vs-snapshot design the assignment asks us to reason about.
 */
export interface IBoardOp {
  board: Types.ObjectId;
  doc: DocType;
  update: Buffer;
  seq: number;
  actor: Types.ObjectId | null;
  createdAt: Date;
}
export type BoardOpDoc = HydratedDocument<IBoardOp>;

const boardOpSchema = new Schema<IBoardOp>(
  {
    board: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    doc: { type: String, enum: DOC_TYPES, required: true },
    update: { type: Buffer, required: true },
    seq: { type: Number, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonTransform('update') },
);
boardOpSchema.index({ board: 1, doc: 1, seq: 1 });

export const BoardOp = model<IBoardOp>('BoardOp', boardOpSchema);

/**
 * Full-state snapshot for fast board load + version history (restore-to-snapshot).
 * `state` is `Y.encodeStateAsUpdate` of the whole sub-document.
 */
export interface ISnapshot {
  board: Types.ObjectId;
  doc: DocType;
  state: Buffer;
  label: string;
  createdBy: Types.ObjectId | null;
  /** Highest op seq folded into this snapshot — ops with a lower seq can be pruned. */
  seq: number;
  auto: boolean;
  createdAt: Date;
}
export type SnapshotDoc = HydratedDocument<ISnapshot>;

const snapshotSchema = new Schema<ISnapshot>(
  {
    board: { type: Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
    doc: { type: String, enum: DOC_TYPES, required: true },
    state: { type: Buffer, required: true },
    label: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    seq: { type: Number, default: 0 },
    auto: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonTransform('state') },
);
snapshotSchema.index({ board: 1, doc: 1, createdAt: -1 });

export const Snapshot = model<ISnapshot>('Snapshot', snapshotSchema);
