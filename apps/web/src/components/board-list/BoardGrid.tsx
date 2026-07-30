import { LayoutGrid } from 'lucide-react';
import type { Board } from '@collabboard/shared';
import { Button } from '../ui/Button';
import { BoardCard } from './BoardCard';

interface BoardGridProps {
  boards: Board[];
  loading: boolean;
  onStarChange?: (id: string, starred: boolean) => void;
  onArchived?: (id: string) => void;
  onDeleted?: (id: string) => void;
  /** CTA wired into the empty state. */
  onCreate?: () => void;
}

/** Responsive board grid with dedicated loading (skeleton) and empty states. */
export function BoardGrid({
  boards,
  loading,
  onStarChange,
  onArchived,
  onDeleted,
  onCreate,
}: BoardGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <LayoutGrid className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-base font-semibold text-slate-800">No boards yet</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Create your first board to start sketching, planning, and taking notes together.
        </p>
        {onCreate && (
          <Button className="mt-5" onClick={onCreate}>
            New board
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <BoardCard
          key={board.id}
          board={board}
          onStarChange={onStarChange}
          onArchived={onArchived}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
