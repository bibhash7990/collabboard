import * as Y from 'yjs';

/**
 * Extract a plain-text projection from the Tiptap/ProseMirror Yjs fragment.
 * Used to keep `Note.text` searchable and to feed the AI action-item extractor
 * without shipping the whole CRDT around.
 */
export function xmlFragmentToText(fragment: Y.XmlFragment): string {
  const lines: string[] = [];
  const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlFragment, buffer: string[]): void => {
    if (node instanceof Y.XmlText) {
      buffer.push(node.toString());
      return;
    }
    const isBlock =
      node instanceof Y.XmlElement &&
      ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(node.nodeName);
    const local: string[] = [];
    node.forEach((child) => walk(child as Y.XmlElement | Y.XmlText, local));
    if (isBlock) {
      lines.push(local.join(''));
    } else {
      buffer.push(local.join(''));
    }
  };
  walk(fragment, []);
  return lines.join('\n').trim();
}

export const toB64 = (u: Uint8Array): string => Buffer.from(u).toString('base64');
export const fromB64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

/**
 * Coerce a persisted binary field to a Uint8Array that Yjs can decode.
 *
 * Mongoose `.lean()` returns a BSON `Binary` (not a Node `Buffer`) for `Buffer`
 * schema fields, and `new Uint8Array(binary)` on that object yields garbage —
 * which surfaces downstream as a cryptic "Unexpected end of array" in lib0. So we
 * explicitly unwrap every shape the field can arrive in: Buffer/Uint8Array,
 * BSON Binary (`.buffer` / `.value()`), a typed-array view, an ArrayBuffer, or a
 * JSON-serialized `{ type: 'Buffer', data: [...] }`.
 */
export function bufToU8(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input; // Node Buffer is a Uint8Array subclass
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  const anyInput = input as {
    buffer?: unknown;
    value?: (asRaw?: boolean) => unknown;
    data?: number[];
  };
  if (anyInput?.buffer instanceof Uint8Array) return new Uint8Array(anyInput.buffer);
  if (typeof anyInput?.value === 'function') {
    const raw = anyInput.value(true);
    if (raw instanceof Uint8Array) return new Uint8Array(raw);
  }
  if (Array.isArray(anyInput?.data)) return Uint8Array.from(anyInput.data);
  return new Uint8Array(input as ArrayLike<number>);
}
