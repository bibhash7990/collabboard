import {
  ArrowUpRight,
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  StickyNote as StickyIcon,
  Type,
} from 'lucide-react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { Tool } from '../../stores/boardStore';
import { useBoardStore } from '../../stores/boardStore';

const TOOLS: Array<{ tool: Tool; icon: LucideIcon; label: string }> = [
  { tool: 'select', icon: MousePointer2, label: 'Select (V)' },
  { tool: 'pen', icon: Pencil, label: 'Pen' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle' },
  { tool: 'ellipse', icon: Circle, label: 'Ellipse' },
  { tool: 'line', icon: Minus, label: 'Line' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { tool: 'text', icon: Type, label: 'Text' },
  { tool: 'sticky', icon: StickyIcon, label: 'Sticky note' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser' },
];

const SWATCHES = ['#1e293b', '#ef4444', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
const WIDTHS = [2, 4, 8];

/** Floating vertical tool rail. Fully disabled for viewers. */
export function Toolbar({ canEdit }: { canEdit: boolean }) {
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const color = useBoardStore((s) => s.color);
  const setColor = useBoardStore((s) => s.setColor);
  const strokeWidth = useBoardStore((s) => s.strokeWidth);
  const setStrokeWidth = useBoardStore((s) => s.setStrokeWidth);

  return (
    <div
      className={clsx(
        'flex w-14 flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur',
        !canEdit && 'pointer-events-none opacity-50',
      )}
    >
      {TOOLS.map(({ tool: t, icon: Icon, label }) => (
        <button
          key={t}
          type="button"
          title={label}
          disabled={!canEdit}
          onClick={() => setTool(t)}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl transition',
            tool === t ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          <Icon className="h-5 w-5" />
        </button>
      ))}

      <div className="my-1 h-px w-8 bg-slate-200" />

      {/* Colour: quick swatches + a native picker for anything else. */}
      <div className="grid grid-cols-2 gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            disabled={!canEdit}
            onClick={() => setColor(c)}
            className={clsx(
              'h-4 w-4 rounded-full ring-1 ring-slate-300 transition',
              color === c && 'ring-2 ring-offset-1 ring-brand-500',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <label
        className="mt-1 flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-lg ring-1 ring-slate-300"
        title="Custom colour"
        style={{ backgroundColor: color }}
      >
        <input
          type="color"
          value={color}
          disabled={!canEdit}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-8 cursor-pointer opacity-0"
        />
      </label>

      <div className="my-1 h-px w-8 bg-slate-200" />

      {/* Stroke width presets. */}
      <div className="flex flex-col items-center gap-1">
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            title={`Stroke ${w}px`}
            disabled={!canEdit}
            onClick={() => setStrokeWidth(w)}
            className={clsx(
              'flex h-7 w-8 items-center justify-center rounded-lg transition',
              strokeWidth === w ? 'bg-brand-100' : 'hover:bg-slate-100',
            )}
          >
            <span className="rounded-full bg-slate-700" style={{ width: w + 6, height: w + 2 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
