import type Konva from 'konva';
import { Group, Rect, Text } from 'react-konva';
import type { CanvasElement } from '@collabboard/shared';

/** Shared prop shape for every canvas primitive renderer. */
export interface ShapeProps {
  element: CanvasElement;
  /** When true the node is draggable and reacts to edit gestures. */
  editable: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onChange?: (el: CanvasElement) => void;
}

/**
 * Floats a DOM `<textarea>` at the pointer so text is edited with real caret /
 * IME support rather than a Konva stand-in. Positioned with the raw client
 * coordinates of the triggering event, which sidesteps stage pan/zoom math.
 */
export function openTextEditor(opts: {
  clientX: number;
  clientY: number;
  value: string;
  fontSize?: number;
  color?: string;
  onCommit: (text: string) => void;
}): void {
  const { clientX, clientY, value, fontSize = 18, color = '#1e293b', onCommit } = opts;
  const ta = document.createElement('textarea');
  ta.value = value;
  Object.assign(ta.style, {
    position: 'fixed',
    left: `${clientX}px`,
    top: `${clientY}px`,
    zIndex: '1000',
    minWidth: '160px',
    minHeight: '48px',
    padding: '6px 8px',
    border: '1px solid #6366f1',
    borderRadius: '8px',
    outline: 'none',
    resize: 'both',
    font: `${fontSize}px Inter, ui-sans-serif, sans-serif`,
    color,
    background: 'white',
    boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    const text = ta.value;
    ta.removeEventListener('blur', onBlur);
    ta.removeEventListener('keydown', onKey);
    ta.remove();
    if (commit) onCommit(text);
  };
  const onBlur = () => finish(true);
  const onKey = (ev: KeyboardEvent) => {
    // Enter commits; Shift+Enter inserts a newline; Escape discards.
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      finish(true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      finish(false);
    }
  };
  ta.addEventListener('blur', onBlur);
  ta.addEventListener('keydown', onKey);
}

const DEFAULT_W = 180;
const DEFAULT_H = 180;

/** A sticky note: a tinted rounded card with wrapped text, edited on double-click. */
export function StickyNote({ element, editable, isSelected, onSelect, onChange }: ShapeProps) {
  const width = element.width ?? DEFAULT_W;
  const height = element.height ?? DEFAULT_H;
  const fill = element.fill ?? '#fef08a';
  const textColor = element.stroke ?? '#1e293b';

  const commit = (patch: Partial<CanvasElement>) =>
    onChange?.({ ...element, ...patch, updatedAt: Date.now() });

  return (
    <Group
      id={element.id}
      x={element.x ?? 0}
      y={element.y ?? 0}
      rotation={element.rotation ?? 0}
      draggable={editable}
      onClick={() => onSelect?.(element.id)}
      onTap={() => onSelect?.(element.id)}
      onDragEnd={(e) => commit({ x: e.target.x(), y: e.target.y() })}
      onDblClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!editable) return;
        openTextEditor({
          clientX: e.evt.clientX,
          clientY: e.evt.clientY,
          value: element.text ?? '',
          fontSize: element.fontSize ?? 16,
          color: textColor,
          onCommit: (text) => commit({ text }),
        });
      }}
    >
      <Rect
        width={width}
        height={height}
        fill={fill}
        cornerRadius={8}
        shadowColor={isSelected ? '#6366f1' : '#0f172a'}
        shadowBlur={isSelected ? 14 : 8}
        shadowOpacity={isSelected ? 0.5 : 0.18}
        shadowOffsetY={2}
      />
      <Text
        text={element.text || (editable ? 'Double-click to edit' : '')}
        width={width}
        height={height}
        padding={12}
        fontSize={element.fontSize ?? 16}
        fontFamily="Inter, ui-sans-serif, sans-serif"
        fill={element.text ? textColor : '#94a3b8'}
        wrap="word"
        verticalAlign="top"
        listening={false}
      />
    </Group>
  );
}
