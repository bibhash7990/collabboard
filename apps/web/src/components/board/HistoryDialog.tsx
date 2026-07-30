import { useEffect, useState } from 'react';
import { History, RotateCcw, Save } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Snapshot } from '@collabboard/shared';
import { snapshotsApi } from '../../api/boardExtras';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../../hooks/useToast';

interface HistoryDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** Editors can save + restore versions; viewers browse only. */
  canEdit: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HistoryDialog({ open, onClose, boardId, canEdit }: HistoryDialogProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    snapshotsApi
      .list(boardId)
      .then(setSnapshots)
      .catch(() => toast('Failed to load history', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) {
      setConfirmId(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId]);

  const save = async () => {
    setSaving(true);
    try {
      await snapshotsApi.create(boardId);
      toast('Version saved', 'success');
      load();
    } catch {
      toast('Could not save version', 'error');
    } finally {
      setSaving(false);
    }
  };

  const restore = async (snapshotId: string) => {
    setRestoring(snapshotId);
    try {
      await snapshotsApi.restore(boardId, snapshotId);
      toast('Version restored — synced to everyone', 'success');
      setConfirmId(null);
    } catch {
      toast('Could not restore version', 'error');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Version history" className="max-w-lg">
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={save} loading={saving}>
            <Save className="h-4 w-4" />
            Save current version
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading history…" />
      ) : snapshots.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
          <History className="h-6 w-6" />
          <p className="text-sm">No saved versions yet.</p>
        </div>
      ) : (
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto scrollbar-thin">
          {snapshots.map((snap) => (
            <li
              key={snap.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {snap.label || 'Untitled snapshot'}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                    {snap.doc}
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })} ·{' '}
                  {formatBytes(snap.size)}
                </p>
              </div>
              {canEdit &&
                (confirmId === snap.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={restoring === snap.id}
                      onClick={() => restore(snap.id)}
                    >
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(snap.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    title="Restore this version"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
