import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { Workspace } from '@collabboard/shared';
import { LIMITS } from '@collabboard/shared';
import { workspacesApi } from '../../api/workspaces';
import { useToast } from '../../hooks/useToast';
import { normalizeError } from '../../lib/apiClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

interface WorkspaceSwitcherProps {
  /** Currently selected workspace id (controlled). */
  value: string | null;
  onChange: (workspaceId: string) => void;
  /** Lifts the loaded/updated list so parents can reuse it (e.g. create-board). */
  onWorkspacesChange?: (workspaces: Workspace[]) => void;
}

/**
 * Owns the workspace list (the only place that reads it) and exposes a controlled
 * selection. Auto-selects the first workspace on load so the dashboard always has
 * a scope to query against, and can spin up a new workspace inline.
 */
export function WorkspaceSwitcher({ value, onChange, onWorkspacesChange }: WorkspaceSwitcherProps) {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load once on mount; auto-select the first workspace when nothing is chosen yet.
  useEffect(() => {
    workspacesApi
      .list()
      .then((ws) => {
        setWorkspaces(ws);
        onWorkspacesChange?.(ws);
        if (!value && ws.length > 0) onChange(ws[0].id);
      })
      .catch((err) => toast(normalizeError(err).message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = workspaces.find((w) => w.id === value) ?? null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const created = await workspacesApi.create({ name: trimmed });
      const next = [...workspaces, created];
      setWorkspaces(next);
      onWorkspacesChange?.(next);
      onChange(created.id);
      setCreating(false);
      setName('');
      toast('Workspace created', 'success');
    } catch (err) {
      toast(normalizeError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="max-w-[12rem] truncate">{selected?.name ?? 'Select workspace'}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-slide-up"
        >
          <div className="max-h-64 overflow-y-auto py-1 scrollbar-thin">
            {workspaces.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No workspaces yet</p>
            ) : (
              workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="option"
                  aria-selected={w.id === value}
                  onClick={() => {
                    onChange(w.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="truncate">{w.name}</span>
                  {w.id === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-brand-600 transition hover:bg-brand-50"
          >
            <Plus className="h-4 w-4" />
            New workspace
          </button>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => !busy && setCreating(false)}
        title="New workspace"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={busy} disabled={!name.trim()}>
              Create
            </Button>
          </>
        }
      >
        <Input
          label="Workspace name"
          name="workspaceName"
          value={name}
          maxLength={LIMITS.WORKSPACE_NAME_MAX}
          placeholder="e.g. Product Design"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </Modal>
    </div>
  );
}
