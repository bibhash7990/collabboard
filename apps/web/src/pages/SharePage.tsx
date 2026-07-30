import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layer, Stage } from 'react-konva';
import * as Y from 'yjs';
import { Eye, Link2Off } from 'lucide-react';
import type { CanvasElement, PublicBoardResponse } from '@collabboard/shared';
import { shareApi } from '../api/boardExtras';
import { fromB64 } from '../lib/base64';
import { Spinner } from '../components/ui/Spinner';
import { ShapeRenderer } from '../components/canvas/ShapeRenderer';

/** Bounding box across every element, so the view can auto-fit the content. */
function contentBounds(
  elements: CanvasElement[],
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    found = true;
  };
  for (const el of elements) {
    const pts = el.points;
    if (pts && pts.length > 0) {
      for (let i = 0; i < pts.length; i += 2) extend(pts[i], pts[i + 1]);
    } else {
      const x = el.x ?? 0;
      const y = el.y ?? 0;
      const w = el.width ?? (el.type === 'text' ? 200 : 0);
      const h = el.height ?? (el.type === 'text' ? 40 : 0);
      extend(x, y);
      extend(x + w, y + h);
    }
  }
  return found ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

export function SharePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let active = true;
    shareApi
      .getPublic(token)
      .then((d) => active && setData(d))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  // Decode the frozen canvas snapshot into plain elements for read-only render.
  const elements = useMemo<CanvasElement[]>(() => {
    if (!data?.canvasState) return [];
    const doc = new Y.Doc();
    Y.applyUpdate(doc, fromB64(data.canvasState));
    const list = Array.from(doc.getMap<CanvasElement>('elements').values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    doc.destroy();
    return list;
  }, [data?.canvasState]);

  // Fit the content into the available viewport with a little padding.
  const view = useMemo(() => {
    const b = contentBounds(elements);
    if (!b || size.width === 0 || b.w === 0 || b.h === 0) return { x: 0, y: 0, scale: 1 };
    const pad = 48;
    const scale = Math.min((size.width - pad) / b.w, (size.height - pad) / b.h, 1);
    return {
      scale,
      x: (size.width - b.w * scale) / 2 - b.x * scale,
      y: (size.height - b.h * scale) / 2 - b.y * scale,
    };
  }, [elements, size]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading shared board…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <Link2Off className="h-8 w-8" />
        <p className="text-sm">This share link is invalid or has expired.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <Eye className="h-5 w-5 text-brand-600" />
        <h1 className="text-sm font-semibold text-slate-800">{data.board.title}</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          Shared board · view only
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div ref={containerRef} className="relative flex-1 overflow-hidden bg-white">
          {size.width > 0 && (
            <Stage
              width={size.width}
              height={size.height}
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale}
            >
              <Layer>
                {elements.map((el) => (
                  <ShapeRenderer key={el.id} element={el} editable={false} />
                ))}
              </Layer>
            </Stage>
          )}
          {elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              This board has no canvas content.
            </div>
          )}
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Meeting Notes</h2>
          </div>
          <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-700 scrollbar-thin">
            {data.notesText.trim() ? (
              data.notesText
            ) : (
              <span className="text-slate-400">No notes yet.</span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
