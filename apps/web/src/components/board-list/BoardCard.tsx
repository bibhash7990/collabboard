import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArchiveRestore, Clock, MoreVertical, Star, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { Board } from '@collabboard/shared';
import { boardsApi } from '../../api/boards';
import { useToast } from '../../hooks/useToast';
import { normalizeError } from '../../lib/apiClient';
import { Avatar } from '../ui/Avatar';
import { RoleBadge } from '../ui/Badge';

interface BoardCardProps {
  board: Board;
  /** Sync the parent list once the server confirms a star toggle. */
  onStarChange?: (id: string, starred: boolean) => void;
  onArchived?: (id: string) => void;
  onDeleted?: (id: string) => void;
}

/**
 * A single board tile. Clicking navigates into the board; the star toggle and the
 * owner-only menu are interactive islands that stop propagation so they never
 * trigger navigation. The star is optimistic and reverts if the request fails.
 */
export function BoardCard({ board, onStarChange, onArchived, onDeleted }: BoardCardProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [starred, setStarred] = useState(Boolean(board.starred));
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep local star in sync if the parent re-fetches with fresh data.
  useEffect(() => setStarred(Boolean(board.starred)), [board.starred]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const isOwner = board.myRole === 'owner';
  const owner = board.members.find((m) => m.userId === board.ownerId);
  const ownerName = owner?.user?.name ?? 'Unknown owner';
  const lastOpened = board.lastOpenedAt
    ? formatDistanceToNow(new Date(board.lastOpenedAt), { addSuffix: true })
    : 'Not opened yet';

  const open = () => navigate(`/board/${board.id}`);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const toggleStar = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    const next = !starred;
    setStarred(next); // optimistic
    try {
      const confirmed = await boardsApi.star(board.id, next);
      setStarred(confirmed);
      onStarChange?.(board.id, confirmed);
    } catch (err) {
      setStarred(!next); // revert on failure
      toast(normalizeError(err).message, 'error');
    }
  };

  const archive = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setBusy(true);
    try {
      await boardsApi.update(board.id, { isArchived: !board.isArchived });
      toast(board.isArchived ? 'Board restored' : 'Board archived', 'success');
      onArchived?.(board.id);
    } catch (err) {
      toast(normalizeError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!window.confirm(`Delete “${board.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await boardsApi.remove(board.id);
      toast('Board deleted', 'success');
      onDeleted?.(board.id);
    } catch (err) {
      toast(normalizeError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      className={clsx(
        'group relative flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition',
        'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 flex-1 font-semibold text-slate-800">{board.title}</h3>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={toggleStar}
            aria-pressed={starred}
            aria-label={starred ? 'Unstar board' : 'Star board'}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <Star className={clsx('h-4 w-4', starred && 'fill-amber-400 text-amber-400')} />
          </button>

          {isOwner && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="Board actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg animate-slide-up"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={archive}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    {board.isArchived ? (
                      <ArchiveRestore className="h-4 w-4 text-slate-400" />
                    ) : (
                      <Archive className="h-4 w-4 text-slate-400" />
                    )}
                    {board.isArchived ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={remove}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Avatar name={ownerName} color={owner?.user?.avatarColor} size={22} />
        <span className="truncate text-sm text-slate-500">{ownerName}</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5">
          {board.myRole && <RoleBadge role={board.myRole} />}
          {board.isArchived && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Archived
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          {lastOpened}
        </span>
      </div>
    </div>
  );
}
