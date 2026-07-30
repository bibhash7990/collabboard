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

/** Coerce a Mongoose/BSON binary field (a Node Buffer at runtime) to a Uint8Array. */
export const bufToU8 = (b: unknown): Uint8Array => new Uint8Array(b as Buffer);
