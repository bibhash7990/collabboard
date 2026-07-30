import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import type { ActionItem } from '@collabboard/shared';
import type { BoardConnection } from '../../lib/yjsBoard';
import { useAuthStore } from '../../stores/authStore';
import { Spinner } from '../ui/Spinner';
import { ActionItemsPanel } from './ActionItemsPanel';

interface NotesPanelProps {
  connection: BoardConnection;
  canEdit: boolean;
  boardId: string;
  onActionItems?: (items: ActionItem[]) => void;
}

/**
 * Collaborative meeting notes. Content lives entirely in `connection.notesDoc`
 * (Yjs), so StarterKit's own history is disabled and Collaboration binds to the
 * shared XML fragment `'default'` — the exact field the server projects to text.
 * Remote carets come from the same awareness the canvas presence uses.
 */
export function NotesPanel({ connection, canEdit, boardId, onActionItems }: NotesPanelProps) {
  const user = useAuthStore((s) => s.user);

  const editor = useEditor(
    {
      editable: canEdit,
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: connection.notesDoc, field: 'default' }),
        CollaborationCursor.configure({
          provider: { awareness: connection.awareness },
          user: { name: user?.name ?? 'Guest', color: user?.avatarColor ?? '#6366f1' },
        }),
        Placeholder.configure({
          placeholder: 'Capture meeting notes… everyone sees changes live.',
        }),
      ],
    },
    [connection],
  );

  // Toggle editability without tearing down the editor (e.g. role change).
  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Meeting Notes</h2>
        <p className="text-xs text-slate-400">
          {canEdit ? 'Live collaborative document' : 'Read-only'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-800 scrollbar-thin">
        {editor ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <Spinner label="Loading notes…" />
        )}
      </div>

      <ActionItemsPanel boardId={boardId} onItemsChange={onActionItems} />
    </div>
  );
}
