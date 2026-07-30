import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { jsonTransform } from './_helpers';

/**
 * The meeting-notes rich text lives in the Yjs `notes` doc (ops + snapshots).
 * This model stores a flattened plain-text projection kept up to date on save,
 * so the notes are searchable and feedable to the AI action-item extractor
 * without decoding the CRDT.
 */
export interface INote {
  board: Types.ObjectId;
  text: string;
  updatedAt: Date;
  createdAt: Date;
}
export type NoteDoc = HydratedDocument<INote>;

const noteSchema = new Schema<INote>(
  {
    board: { type: Schema.Types.ObjectId, ref: 'Board', required: true, unique: true, index: true },
    text: { type: String, default: '' },
  },
  { timestamps: true, toJSON: jsonTransform() },
);
noteSchema.index({ text: 'text' });

export const Note = model<INote>('Note', noteSchema);
