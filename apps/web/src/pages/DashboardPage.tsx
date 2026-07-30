import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  BoardSort,
  ListBoardsQuery,
  ListBoardsResponse,
  Workspace,
} from '@collabboard/shared';
import { boardsApi } from '../api/boards';
import { useToast } from '../hooks/useToast';
import { normalizeError } from '../lib/apiClient';
import { AppHeader } from '../components/layout/AppHeader';
import { WorkspaceSwitcher } from '../components/board-list/WorkspaceSwitcher';
import { BoardListToolbar } from '../components/board-list/BoardListToolbar';
import { BoardGrid } from '../components/board-list/BoardGrid';
import { CreateBoardModal } from '../components/board-list/CreateBoardModal';

const PAGE_SIZE = 12;

/** Small local debounce so the search field stays responsive without over-fetching. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Board dashboard: workspace scope + search/sort/starred filters drive a single
 * `boardsApi.list` query. All filter changes reset to page 1; mutations that alter
 * visibility (archive/delete) trigger a refetch via a reload token.
 */
export function DashboardPage() {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [sort, setSort] = useState<BoardSort>('lastOpened');
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  const [data, setData] = useState<ListBoardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedQ = useDebounced(q, 250);

  // Any filter change should send us back to the first page.
  const changeWorkspace = (id: string) => {
    setWorkspaceId(id);
    setPage(1);
  };
  const changeQ = (value: string) => {
    setQ(value);
    setPage(1);
  };
  const changeSort = (value: BoardSort) => {
    setSort(value);
    setPage(1);
  };
  const changeStarred = (value: boolean) => {
    setStarredOnly(value);
    setPage(1);
  };
  const refetch = () => setReloadToken((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query: ListBoardsQuery = { sort, page, limit: PAGE_SIZE };
    if (workspaceId) query.workspaceId = workspaceId;
    if (debouncedQ.trim()) query.q = debouncedQ.trim();
    if (starredOnly) query.starred = true;

    boardsApi
      .list(query)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) toast(normalizeError(err).message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
  }, [workspaceId, debouncedQ, starredOnly, sort, page, reloadToken]);

  // Optimistic star already happened in the card; keep the list in sync and drop
  // the tile when it no longer matches the active "starred only" filter.
  const handleStarChange = (id: string, starred: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      if (starredOnly && !starred) {
        return {
          ...prev,
          boards: prev.boards.filter((b) => b.id !== id),
          total: Math.max(0, prev.total - 1),
        };
      }
      return { ...prev, boards: prev.boards.map((b) => (b.id === id ? { ...b, starred } : b)) };
    });
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-full bg-slate-50">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Boards</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {total} {total === 1 ? 'board' : 'boards'}
            </p>
          </div>
          <WorkspaceSwitcher
            value={workspaceId}
            onChange={changeWorkspace}
            onWorkspacesChange={setWorkspaces}
          />
        </div>

        <div className="mt-6">
          <BoardListToolbar
            search={q}
            onSearchChange={changeQ}
            sort={sort}
            onSortChange={changeSort}
            starredOnly={starredOnly}
            onStarredOnlyChange={changeStarred}
            onCreate={() => setCreateOpen(true)}
          />
        </div>

        <div className="mt-6">
          <BoardGrid
            boards={data?.boards ?? []}
            loading={loading}
            onStarChange={handleStarChange}
            onArchived={refetch}
            onDeleted={refetch}
            onCreate={() => setCreateOpen(true)}
          />
        </div>

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      <CreateBoardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        workspaces={workspaces}
        defaultWorkspaceId={workspaceId}
      />
    </div>
  );
}
