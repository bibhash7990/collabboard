import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Workspace } from '@collabboard/shared';
import { LIMITS } from '@collabboard/shared';
import { boardsApi } from '../../api/boards';
import { useToast } from '../../hooks/useToast';
import { normalizeError } from '../../lib/apiClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  /** Pre-selected workspace (the dashboard's current scope). */
  defaultWorkspaceId?: string | null;
}

/** Creates a board and jumps straight into it on success. */
export function CreateBoardModal({
  open,
  onClose,
  workspaces,
  defaultWorkspaceId,
}: CreateBoardModalProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the form each time the modal opens, honouring the current scope.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setWorkspaceId(defaultWorkspaceId ?? workspaces[0]?.id ?? '');
  }, [open, defaultWorkspaceId, workspaces]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || !workspaceId) return;
    setBusy(true);
    try {
      const board = await boardsApi.create({ workspaceId, title: trimmed });
      onClose();
      navigate(`/board/${board.id}`);
    } catch (err) {
      toast(normalizeError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="New board"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!title.trim() || !workspaceId}>
            Create board
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Board title"
          name="boardTitle"
          value={title}
          maxLength={LIMITS.BOARD_TITLE_MAX}
          placeholder="e.g. Q3 Roadmap"
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="boardWorkspace" className="text-sm font-medium text-slate-700">
            Workspace
          </label>
          <select
            id="boardWorkspace"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {workspaces.length === 0 && <option value="">No workspaces available</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
