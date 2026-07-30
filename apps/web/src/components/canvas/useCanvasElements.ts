import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import type { CanvasElement } from '@collabboard/shared';

interface CanvasElements {
  elements: CanvasElement[];
  upsert: (el: CanvasElement) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * Subscribes to a board's `elements` Y.Map. Each element is keyed by its id, so
 * concurrent edits to different elements are conflict-free by construction. We
 * project to a `createdAt`-sorted array so z-order is identical on every client
 * (Y.Map iteration order is not guaranteed to match across peers).
 */
export function useCanvasElements(doc: Y.Doc | null): CanvasElements {
  const map = useMemo(() => doc?.getMap<CanvasElement>('elements') ?? null, [doc]);
  const [elements, setElements] = useState<CanvasElement[]>([]);

  useEffect(() => {
    if (!map) {
      setElements([]);
      return;
    }
    const read = () =>
      setElements(Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt));
    read();
    map.observe(read);
    return () => map.unobserve(read);
  }, [map]);

  const upsert = useCallback(
    (el: CanvasElement) => {
      if (!doc || !map) return;
      // Single transaction → one atomic update over the wire per mutation.
      doc.transact(() => map.set(el.id, el));
    },
    [doc, map],
  );

  const remove = useCallback(
    (id: string) => {
      if (!doc || !map) return;
      doc.transact(() => map.delete(id));
    },
    [doc, map],
  );

  const clear = useCallback(() => {
    if (!doc || !map) return;
    doc.transact(() => map.clear());
  }, [doc, map]);

  return { elements, upsert, remove, clear };
}
