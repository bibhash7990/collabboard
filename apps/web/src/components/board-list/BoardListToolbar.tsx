import { Plus, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import { BOARD_SORT, type BoardSort } from '@collabboard/shared';
import { Button } from '../ui/Button';

interface BoardListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: BoardSort;
  onSortChange: (sort: BoardSort) => void;
  starredOnly: boolean;
  onStarredOnlyChange: (value: boolean) => void;
  onCreate: () => void;
}

/** Human labels for the API's sort keys. */
const SORT_LABELS: Record<BoardSort, string> = {
  lastOpened: 'Last opened',
  updated: 'Last updated',
  created: 'Date created',
  title: 'Title (A–Z)',
};

/**
 * Fully controlled filter bar. Debouncing of `onSearchChange` is the consumer's
 * job (the dashboard debounces before hitting the API) so the input stays snappy.
 */
export function BoardListToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  starredOnly,
  onStarredOnlyChange,
  onCreate,
}: BoardListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title or owner…"
          aria-label="Search boards"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onStarredOnlyChange(!starredOnly)}
          aria-pressed={starredOnly}
          className={clsx(
            'flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium shadow-sm transition',
            starredOnly
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          <Star className={clsx('h-4 w-4', starredOnly && 'fill-amber-400 text-amber-400')} />
          Starred
        </button>

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as BoardSort)}
          aria-label="Sort boards"
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {BOARD_SORT.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>

        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New board
        </Button>
      </div>
    </div>
  );
}
