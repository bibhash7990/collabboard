import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { ShareLink } from '@collabboard/shared';
import { shareApi } from '../../api/boardExtras';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../../hooks/useToast';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
}

const publicUrl = (token: string) => `${window.location.origin}/share/${token}`;

/** Manage read-only public links (editors+). */
export function ShareDialog({ open, onClose, boardId }: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ttl, setTtl] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    shareApi
      .list(boardId)
      .then((l) => active && setLinks(l))
      .catch(() => active && toast('Failed to load share links', 'error'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // `toast` is intentionally excluded: it is a fresh closure each render and
    // would otherwise re-trigger the fetch on every render while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId]);

  const create = async () => {
    setCreating(true);
    try {
      const days = ttl.trim() ? Number(ttl) : null;
      const { link, url } = await shareApi.create(boardId, days);
      setLinks((prev) => [link, ...prev]);
      setTtl('');
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setCopied(link.id);
      toast('Share link created and copied', 'success');
    } catch {
      toast('Could not create share link', 'error');
    } finally {
      setCreating(false);
    }
  };

  const copy = async (link: ShareLink) => {
    await navigator.clipboard.writeText(publicUrl(link.token)).catch(() => undefined);
    setCopied(link.id);
    toast('Link copied', 'success');
  };

  const revoke = async (linkId: string) => {
    try {
      await shareApi.revoke(boardId, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      toast('Could not revoke link', 'error');
    }
  };

  const active = links.filter((l) => !l.revoked);

  return (
    <Modal open={open} onClose={onClose} title="Share board" className="max-w-lg">
      <div className="flex items-end gap-2">
        <Input
          label="Expiry (days, optional)"
          type="number"
          min={1}
          max={30}
          placeholder="No expiry"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
          className="w-40"
        />
        <Button onClick={create} loading={creating}>
          <Link2 className="h-4 w-4" />
          Create link
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner label="Loading links…" />
        ) : active.length === 0 ? (
          <p className="text-sm text-slate-500">No active share links yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((link) => (
              <li
                key={link.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all text-xs text-slate-700">{publicUrl(link.token)}</p>
                  <p className="text-xs text-slate-400">
                    {link.expiresAt
                      ? `Expires ${format(new Date(link.expiresAt), 'PP')}`
                      : 'Never expires'}
                  </p>
                </div>
                <button
                  onClick={() => copy(link)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                  title="Copy link"
                >
                  {copied === link.id ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => revoke(link.id)}
                  className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  title="Revoke"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
