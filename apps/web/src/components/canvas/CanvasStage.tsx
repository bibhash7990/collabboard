import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { Layer, Stage } from 'react-konva';
import type { CanvasElement, ShapeType } from '@collabboard/shared';
import type { BoardConnection } from '../../lib/yjsBoard';
import { useBoardStore } from '../../stores/boardStore';
import { useAuthStore } from '../../stores/authStore';
import { useCanvasElements } from './useCanvasElements';
import { ShapeRenderer } from './ShapeRenderer';
import { openTextEditor } from './StickyNote';
import { PresenceLayer } from '../presence/PresenceLayer';

interface CanvasStageProps {
  connection: BoardConnection;
  canEdit: boolean;
  stageRef: RefObject<Konva.Stage>;
  onCursorMove: (x: number, y: number) => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

/** Stage → logical coordinates, accounting for the current pan/zoom transform. */
function relativePointer(stage: Konva.Stage): { x: number; y: number } | null {
  const p = stage.getPointerPosition();
  if (!p) return null;
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  return transform.point(p);
}

/** Walk up from a hit node to the element id set on its shape/group. */
function elementIdAt(node: Konva.Node): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    const id = current.id();
    if (id) return id;
    current = current.getParent();
  }
  return null;
}

/**
 * The interactive whiteboard surface. Reads the active tool/colour from
 * `boardStore`, commits finished shapes into the shared CRDT via
 * `useCanvasElements`, streams the local cursor out through `onCursorMove`, and
 * paints peers with `PresenceLayer`. Viewers get a read-only stage (no drawing,
 * no dragging) but can still pan/zoom to look around.
 */
export function CanvasStage({ connection, canEdit, stageRef, onCursorMove }: CanvasStageProps) {
  const tool = useBoardStore((s) => s.tool);
  const color = useBoardStore((s) => s.color);
  const strokeWidth = useBoardStore((s) => s.strokeWidth);
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon';

  const { elements, upsert, remove } = useCanvasElements(connection.canvasDoc);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CanvasElement | null>(null);
  const [spacePan, setSpacePan] = useState(false);

  const drawing = useRef(false);
  const erasing = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  // Track the surface size so the stage always fills its column.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Space = temporary pan; Delete/Backspace removes the selection. Ignored while
  // typing so notes/dialog inputs keep their keys.
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      return (
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          (el as HTMLElement).isContentEditable)
      );
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing()) {
        e.preventDefault();
        setSpacePan(true);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !typing() &&
        canEdit &&
        selectedId
      ) {
        remove(selectedId);
        setSelectedId(null);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [canEdit, selectedId, remove]);

  const makeBase = (type: ShapeType): CanvasElement => {
    const now = Date.now();
    return { id: crypto.randomUUID(), type, createdBy: userId, createdAt: now, updatedAt: now };
  };

  const eraseAt = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const id = elementIdAt(e.target);
    if (id) {
      remove(id);
      if (selectedId === id) setSelectedId(null);
    }
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage || spacePan) return; // pan mode: let the stage's own drag run
    const p = relativePointer(stage);
    if (!p) return;

    if (!canEdit) return;

    if (tool === 'select') {
      if (e.target === stage) setSelectedId(null); // click on empty canvas clears
      return;
    }
    if (tool === 'eraser') {
      erasing.current = true;
      eraseAt(e);
      return;
    }

    start.current = p;
    if (tool === 'pen') {
      setDraft({ ...makeBase('pen'), points: [p.x, p.y], stroke: color, strokeWidth });
      drawing.current = true;
    } else if (tool === 'line' || tool === 'arrow') {
      setDraft({ ...makeBase(tool), points: [p.x, p.y, p.x, p.y], stroke: color, strokeWidth });
      drawing.current = true;
    } else if (tool === 'rectangle' || tool === 'ellipse') {
      setDraft({
        ...makeBase(tool),
        x: p.x,
        y: p.y,
        width: 0,
        height: 0,
        stroke: color,
        strokeWidth,
        fill: 'transparent',
      });
      drawing.current = true;
    } else if (tool === 'text') {
      const el: CanvasElement = {
        ...makeBase('text'),
        x: p.x,
        y: p.y,
        text: '',
        stroke: color,
        fontSize: 22,
      };
      openTextEditor({
        clientX: e.evt.clientX,
        clientY: e.evt.clientY,
        value: '',
        fontSize: 22,
        color,
        onCommit: (text) => {
          if (text.trim()) upsert({ ...el, text, updatedAt: Date.now() });
        },
      });
    } else if (tool === 'sticky') {
      const el: CanvasElement = {
        ...makeBase('sticky'),
        x: p.x - 90,
        y: p.y - 90,
        width: 180,
        height: 180,
        text: '',
        fill: '#fef08a',
        stroke: '#1e293b',
        fontSize: 16,
      };
      upsert(el);
      setSelectedId(el.id);
      openTextEditor({
        clientX: e.evt.clientX,
        clientY: e.evt.clientY,
        value: '',
        fontSize: 16,
        color: '#1e293b',
        onCommit: (text) => upsert({ ...el, text, updatedAt: Date.now() }),
      });
    }
  };

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const p = relativePointer(stage);
    if (p) onCursorMove(p.x, p.y);

    if (erasing.current) {
      eraseAt(e);
      return;
    }
    if (!drawing.current || !draft || !p) return;

    if (draft.type === 'pen') {
      setDraft({ ...draft, points: [...(draft.points ?? []), p.x, p.y] });
    } else if (draft.type === 'line' || draft.type === 'arrow') {
      setDraft({ ...draft, points: [start.current.x, start.current.y, p.x, p.y] });
    } else {
      const x = Math.min(start.current.x, p.x);
      const y = Math.min(start.current.y, p.y);
      setDraft({
        ...draft,
        x,
        y,
        width: Math.abs(p.x - start.current.x),
        height: Math.abs(p.y - start.current.y),
      });
    }
  };

  const onMouseUp = () => {
    erasing.current = false;
    if (drawing.current && draft) {
      const meaningful =
        draft.type === 'pen'
          ? (draft.points?.length ?? 0) >= 4
          : draft.type === 'line' || draft.type === 'arrow'
            ? Math.hypot(
                (draft.points?.[2] ?? 0) - (draft.points?.[0] ?? 0),
                (draft.points?.[3] ?? 0) - (draft.points?.[1] ?? 0),
              ) > 3
            : (draft.width ?? 0) > 3 || (draft.height ?? 0) > 3;
      if (meaningful) {
        upsert({ ...draft, updatedAt: Date.now() });
        setSelectedId(draft.id);
      }
    }
    drawing.current = false;
    setDraft(null);
  };

  // Zoom toward the cursor; keep the point under the pointer stationary.
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const oldScale = view.scale;
    const worldX = (pointer.x - view.x) / oldScale;
    const worldY = (pointer.y - view.y) / oldScale;
    const next = e.evt.deltaY > 0 ? oldScale / 1.08 : oldScale * 1.08;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setView({ scale, x: pointer.x - worldX * scale, y: pointer.y - worldY * scale });
  };

  const cursor = spacePan
    ? 'grab'
    : tool === 'select'
      ? 'default'
      : tool === 'eraser'
        ? 'cell'
        : 'crosshair';

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={spacePan}
          style={{ cursor, background: '#f8fafc' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onWheel={onWheel}
          onDragEnd={(e) => {
            // Only the stage itself (pan), not a dragged shape, updates the view.
            if (e.target === e.target.getStage())
              setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
        >
          <Layer>
            {elements.map((el) => (
              <ShapeRenderer
                key={el.id}
                element={el}
                editable={canEdit && tool === 'select'}
                isSelected={selectedId === el.id}
                onSelect={setSelectedId}
                onChange={upsert}
              />
            ))}
            {draft && <ShapeRenderer element={draft} editable={false} />}
          </Layer>
          <PresenceLayer />
        </Stage>
      )}
    </div>
  );
}
