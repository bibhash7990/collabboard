import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type Konva from 'konva';
import { SOCKET_EVENTS, type ActionItem, type Board, type Role } from '@collabboard/shared';
import { boardsApi } from '../api/boards';
import { exportApi } from '../api/boardExtras';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { useBoardConnection } from '../hooks/useBoardConnection';
import { usePresence } from '../hooks/usePresence';
import { useToast } from '../hooks/useToast';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { CanvasStage } from '../components/canvas/CanvasStage';
import { Toolbar } from '../components/canvas/Toolbar';
import { ConnectionBadge } from '../components/board/ConnectionBadge';
import { BoardHeader } from '../components/board/BoardHeader';
import { NotesPanel } from '../components/notes/NotesPanel';
import { ShareDialog } from '../components/board/ShareDialog';
import { MembersDialog } from '../components/board/MembersDialog';
import { HistoryDialog } from '../components/board/HistoryDialog';

/** Trigger a browser download for a data/object URL. */
function download(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Dialog = 'share' | 'members' | 'history' | null;

export function BoardPage() {
  const { boardId = '' } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const authUser = useAuthStore((s) => s.user);
  const user = authUser
    ? { id: authUser.id, name: authUser.name, color: authUser.avatarColor }
    : null;

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('viewer');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notesOpen, setNotesOpen] = useState(true);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const stageRef = useRef<Konva.Stage>(null);

  const { connection, status, role: joinedRole } = useBoardConnection(boardId, user);
  const { sendCursor } = usePresence(boardId, authUser?.id);
  const canEdit = role !== 'viewer';

  // Fetch board metadata (title, members, my role) and bump lastOpenedAt.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    boardsApi
      .get(boardId)
      .then((b) => {
        if (!active) return;
        setBoard(b);
        setRole(b.myRole ?? 'viewer');
      })
      .catch(() => active && setLoadError('This board could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [boardId]);

  // Socket join is authoritative for the effective role.
  useEffect(() => {
    setRole(joinedRole);
  }, [joinedRole]);

  // Live role/removal changes pushed by the server.
  useEffect(() => {
    const socket = getSocket();
    const onRole = (p: { boardId: string; role: Role }) => {
      if (p.boardId !== boardId) return;
      setRole(p.role);
      if (connection) connection.role = p.role;
    };
    const onKicked = (p: { boardId: string; reason: string }) => {
      if (p.boardId !== boardId) return;
      toast('You were removed from this board', 'error');
      navigate('/app');
    };
    socket.on(SOCKET_EVENTS.BOARD_ROLE_CHANGED, onRole);
    socket.on(SOCKET_EVENTS.BOARD_KICKED, onKicked);
    return () => {
      socket.off(SOCKET_EVENTS.BOARD_ROLE_CHANGED, onRole);
      socket.off(SOCKET_EVENTS.BOARD_KICKED, onKicked);
    };
    // `toast` omitted on purpose — it is a new closure each render; re-subscribing
    // the socket listeners every render is needless churn (the captured one works).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, connection, navigate]);

  const exportPng = () => {
    const url = stageRef.current?.toDataURL({ pixelRatio: 2 });
    if (!url) return;
    download(url, `${board?.title ?? 'board'}.png`);
  };

  const exportPdf = async () => {
    try {
      const png = stageRef.current?.toDataURL({ pixelRatio: 2 });
      const blob = await exportApi.pdf(boardId, png, actionItems);
      const url = URL.createObjectURL(blob);
      download(url, `${board?.title ?? 'board'}.pdf`);
      URL.revokeObjectURL(url);
    } catch {
      toast('Could not export PDF', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Opening board…" />
      </div>
    );
  }

  if (loadError || !board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <p>{loadError ?? 'Board not found.'}</p>
        <Button variant="secondary" onClick={() => navigate('/app')}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <BoardHeader
        board={board}
        role={role}
        status={status}
        onOpenShare={() => setDialog('share')}
        onOpenMembers={() => setDialog('members')}
        onOpenHistory={() => setDialog('history')}
        onExportPng={exportPng}
        onExportPdf={exportPdf}
        onBoardUpdated={setBoard}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-hidden">
          {connection ? (
            <CanvasStage
              connection={connection}
              canEdit={canEdit}
              stageRef={stageRef}
              onCursorMove={sendCursor}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner label="Connecting to board…" />
            </div>
          )}

          <div className="absolute left-4 top-4">
            <Toolbar canEdit={canEdit} />
          </div>

          <div className="absolute bottom-4 left-4">
            <ConnectionBadge status={status} />
          </div>

          {!notesOpen && (
            <button
              onClick={() => setNotesOpen(true)}
              className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
              title="Show notes"
            >
              <PanelRightOpen className="h-4 w-4" />
              Notes
            </button>
          )}
        </div>

        {notesOpen && (
          <div className="relative w-[380px] shrink-0 border-l border-slate-200">
            <button
              onClick={() => setNotesOpen(false)}
              className="absolute right-2 top-2.5 z-10 rounded p-1 text-slate-400 hover:bg-slate-100"
              title="Collapse notes"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
            {connection && (
              <NotesPanel
                connection={connection}
                canEdit={canEdit}
                boardId={boardId}
                onActionItems={setActionItems}
              />
            )}
          </div>
        )}
      </div>

      <ShareDialog open={dialog === 'share'} onClose={() => setDialog(null)} boardId={boardId} />
      <MembersDialog
        open={dialog === 'members'}
        onClose={() => setDialog(null)}
        boardId={boardId}
        canManage={role === 'owner'}
        currentUserId={authUser?.id ?? ''}
      />
      <HistoryDialog
        open={dialog === 'history'}
        onClose={() => setDialog(null)}
        boardId={boardId}
        canEdit={canEdit}
      />
    </div>
  );
}
