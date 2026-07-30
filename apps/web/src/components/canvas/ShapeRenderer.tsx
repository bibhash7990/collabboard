import type Konva from 'konva';
import { Arrow, Ellipse, Line, Rect, Text } from 'react-konva';
import type { CanvasElement } from '@collabboard/shared';
import { StickyNote, openTextEditor, type ShapeProps } from './StickyNote';

const SELECT = '#6366f1';

/**
 * Renders a single `CanvasElement`. Pen and straight lines map to Konva `Line`;
 * arrows to `Arrow` (a Line subclass with a head, same points-based geometry);
 * boxes to `Rect`/`Ellipse`; text to `Text`; sticky notes to `StickyNote`.
 * When `editable`, nodes are draggable and geometry changes flow back via
 * `onChange` (which the stage upserts into the CRDT).
 */
export function ShapeRenderer(props: ShapeProps) {
  const { element, editable, isSelected, onSelect, onChange } = props;

  const stroke = element.stroke ?? '#1e293b';
  const strokeWidth = element.strokeWidth ?? 3;
  const commit = (patch: Partial<CanvasElement>) =>
    onChange?.({ ...element, ...patch, updatedAt: Date.now() });

  const select = () => onSelect?.(element.id);
  // Empty object (not undefined) so the JSX spread is always over an object type.
  const glow = isSelected ? { shadowColor: SELECT, shadowBlur: 12, shadowOpacity: 0.7 } : {};

  // Dragging a poly-line offsets the node; bake that offset into the points and
  // zero the node so the model stays the single source of truth.
  const onLineDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const dx = node.x();
    const dy = node.y();
    node.position({ x: 0, y: 0 });
    const pts = (element.points ?? []).map((p, i) => (i % 2 === 0 ? p + dx : p + dy));
    commit({ points: pts });
  };

  switch (element.type) {
    case 'pen':
    case 'line':
      return (
        <Line
          id={element.id}
          points={element.points ?? []}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={element.type === 'pen' ? 0.4 : 0}
          hitStrokeWidth={Math.max(strokeWidth, 12)}
          draggable={editable}
          onClick={select}
          onTap={select}
          onDragEnd={onLineDragEnd}
          {...glow}
        />
      );

    case 'arrow':
      return (
        <Arrow
          id={element.id}
          points={element.points ?? []}
          stroke={stroke}
          fill={stroke}
          strokeWidth={strokeWidth}
          pointerLength={10}
          pointerWidth={10}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={Math.max(strokeWidth, 12)}
          draggable={editable}
          onClick={select}
          onTap={select}
          onDragEnd={onLineDragEnd}
          {...glow}
        />
      );

    case 'rectangle':
      return (
        <Rect
          id={element.id}
          x={element.x ?? 0}
          y={element.y ?? 0}
          width={element.width ?? 0}
          height={element.height ?? 0}
          rotation={element.rotation ?? 0}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill={element.fill && element.fill !== 'transparent' ? element.fill : undefined}
          cornerRadius={4}
          draggable={editable}
          onClick={select}
          onTap={select}
          onDragEnd={(e) => commit({ x: e.target.x(), y: e.target.y() })}
          {...glow}
        />
      );

    case 'ellipse': {
      const w = element.width ?? 0;
      const h = element.height ?? 0;
      return (
        <Ellipse
          id={element.id}
          x={(element.x ?? 0) + w / 2}
          y={(element.y ?? 0) + h / 2}
          radiusX={Math.abs(w) / 2}
          radiusY={Math.abs(h) / 2}
          rotation={element.rotation ?? 0}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill={element.fill && element.fill !== 'transparent' ? element.fill : undefined}
          draggable={editable}
          onClick={select}
          onTap={select}
          // Konva positions an ellipse by its centre; convert back to top-left.
          onDragEnd={(e) => commit({ x: e.target.x() - w / 2, y: e.target.y() - h / 2 })}
          {...glow}
        />
      );
    }

    case 'text':
      return (
        <Text
          id={element.id}
          x={element.x ?? 0}
          y={element.y ?? 0}
          text={element.text || 'Text'}
          fontSize={element.fontSize ?? 22}
          fontFamily="Inter, ui-sans-serif, sans-serif"
          fill={stroke}
          rotation={element.rotation ?? 0}
          draggable={editable}
          onClick={select}
          onTap={select}
          onDragEnd={(e) => commit({ x: e.target.x(), y: e.target.y() })}
          onDblClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
            if (!editable) return;
            openTextEditor({
              clientX: e.evt.clientX,
              clientY: e.evt.clientY,
              value: element.text ?? '',
              fontSize: element.fontSize ?? 22,
              color: stroke,
              onCommit: (text) => commit({ text }),
            });
          }}
          {...glow}
        />
      );

    case 'sticky':
      return <StickyNote {...props} />;

    default:
      return null;
  }
}
