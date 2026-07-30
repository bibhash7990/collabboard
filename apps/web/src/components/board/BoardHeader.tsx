import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileDown, History, Image, Share2, Users } from 'lucide-react';
import type { Board, Role } from '@collabboard/shared';
import type { ConnStatus } from '../../lib/yjsBoard';
import { boardsApi } from '../../api/boards';
import { Button } from '../ui/Button';
import { RoleBadge } from '../ui/Badge';
import { useToast } from '../../hooks/useToast';
import { ConnectionBadge } from './ConnectionBadge';
import { PresenceAvatars } from '../presence/PresenceAvatars';

interface BoardHeaderProps {
  board: Board;
  role: Role;
  status: ConnStatus;
  onOpenShare: () => void;
  onOpenMembers: () => void;
  onOpenHistory: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onBoardUpdated: (board: Board) => void;
}

export function BoardHeader({
  board,
  role,
  status,
  onOpenShare,
  onOpenMembers,
  onOpenHistory,
  onExportPng,
  onExportPdf,
  onBoardUpdated,
}: BoardHeaderProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const canEdit = role !== 'viewer';

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(board.title);

  const saveTitle = async () => {
    setEditing(false);
    const next = title.trim();
    if (!next || next === board.title) {
      setTitle(board.title);
      return;
    }
    try {
      const updated = await boardsApi.update(board.id, { title: next });
      onBoardUpdated(updated);
    } catch {
      setTitle(board.title);
      toast('Could not rename board', 'error');
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
      <button
        onClick={() => navigate('/app')}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        title="Back to dashboard"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') {
                setTitle(board.title);
                setEditing(false);
              }
            }}
            className="h-8 min-w-0 rounded-md border border-slate-300 px-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        ) : (
          <button
            onClick={() => canEdit && setEditing(true)}
            className={`truncate text-sm font-semibold text-slate-800 ${canEdit ? 'rounded px-1 hover:bg-slate-100' : 'cursor-default'}`}
            title={canEdit ? 'Rename board' : board.title}
          >
            {board.title}
          </button>
        )}
        <RoleBadge role={role} />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <PresenceAvatars />
        <ConnectionBadge status={status} />

        <div className="flex items-center gap-1">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={onOpenShare} title="Share">
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onOpenMembers} title="Members">
            <Users className="h-4 w-4" />
            Members
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenHistory} title="Version history">
            <History className="h-4 w-4" />
            History
          </Button>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <Button size="sm" variant="secondary" onClick={onExportPng} title="Export PNG">
            <Image className="h-4 w-4" />
            PNG
          </Button>
          <Button size="sm" variant="secondary" onClick={onExportPdf} title="Export PDF">
            <FileDown className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>
    </header>
  );
}
