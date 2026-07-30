import { useEffect, useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { ROLES, type BoardMember, type Role } from '@collabboard/shared';
import { boardsApi } from '../../api/boards';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { RoleBadge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../../hooks/useToast';

interface MembersDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** Owners can invite, change roles, and remove; others view only. */
  canManage: boolean;
  currentUserId: string;
}

export function MembersDialog({
  open,
  onClose,
  boardId,
  canManage,
  currentUserId,
}: MembersDialogProps) {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [inviting, setInviting] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    boardsApi
      .members(boardId)
      .then(setMembers)
      .catch(() => toast('Failed to load members', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId]);

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await boardsApi.invite(boardId, { email: email.trim(), role });
      setEmail('');
      toast('Invitation sent', 'success');
    } catch {
      toast('Could not send invitation', 'error');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, next: Role) => {
    try {
      await boardsApi.updateMemberRole(boardId, { userId, role: next });
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role: next } : m)));
    } catch {
      toast('Could not change role', 'error');
    }
  };

  const remove = async (userId: string) => {
    try {
      await boardsApi.removeMember(boardId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      toast('Could not remove member', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Members" className="max-w-lg">
      {canManage && (
        <div className="mb-4 flex items-end gap-2">
          <Input
            label="Invite by email"
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm capitalize text-slate-700"
          >
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">
                {r}
              </option>
            ))}
          </select>
          <Button onClick={invite} loading={inviting}>
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading members…" />
      ) : (
        <ul className="flex flex-col gap-1">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <li
                key={m.userId}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
              >
                <Avatar
                  name={m.user?.name ?? m.user?.email ?? '?'}
                  color={m.user?.avatarColor}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {m.user?.name ?? m.user?.email ?? m.userId}
                    {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                  </p>
                  {m.user?.email && (
                    <p className="truncate text-xs text-slate-400">{m.user.email}</p>
                  )}
                </div>
                {canManage && !isSelf ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                      className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs capitalize text-slate-700"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="capitalize">
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => remove(m.userId)}
                      className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <RoleBadge role={m.role} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
