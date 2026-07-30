import { Group, Layer, Path, Rect, Text } from 'react-konva';
import { useBoardStore } from '../../stores/boardStore';

// Classic arrow-cursor silhouette, drawn from its tip at (0,0).
const CURSOR_PATH = 'M0 0 L0 16 L4.2 12 L7 18.2 L9.2 17.2 L6.4 11.2 L11.5 11 Z';

/**
 * A non-interactive Konva layer that paints every peer's live cursor. It lives
 * inside the stage so cursors inherit its pan/zoom transform and therefore track
 * the same logical coordinates every collaborator drew at.
 */
export function PresenceLayer() {
  const presence = useBoardStore((s) => s.presence);

  return (
    <Layer listening={false}>
      {Object.values(presence).map((peer) => {
        if (!peer.cursor) return null;
        const labelWidth = Math.max(28, peer.name.length * 7 + 16);
        return (
          <Group key={peer.socketId} x={peer.cursor.x} y={peer.cursor.y}>
            <Path data={CURSOR_PATH} fill={peer.color} stroke="white" strokeWidth={1} />
            <Rect x={14} y={14} width={labelWidth} height={20} cornerRadius={4} fill={peer.color} />
            <Text
              x={14}
              y={14}
              width={labelWidth}
              height={20}
              text={peer.name}
              fontSize={11}
              fontStyle="600"
              fontFamily="Inter, ui-sans-serif, sans-serif"
              fill="white"
              align="center"
              verticalAlign="middle"
            />
          </Group>
        );
      })}
    </Layer>
  );
}
