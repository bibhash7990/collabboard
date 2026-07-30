import { create } from 'zustand';
import type { PresenceUser } from '@collabboard/shared';

export type Tool =
  'select' | 'pen' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'sticky' | 'eraser';

interface BoardUiState {
  tool: Tool;
  color: string;
  fill: string;
  strokeWidth: number;
  /** Live presence keyed by socketId (peers only, never the local user). */
  presence: Record<string, PresenceUser>;

  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setFill: (fill: string) => void;
  setStrokeWidth: (w: number) => void;

  setPresence: (users: PresenceUser[]) => void;
  upsertPresence: (user: PresenceUser) => void;
  removePresenceBySocket: (socketId: string) => void;
  removePresenceByUser: (userId: string) => void;
  resetPresence: () => void;
}

export const useBoardStore = create<BoardUiState>((set) => ({
  tool: 'select',
  color: '#1e293b',
  fill: '#ffffff',
  strokeWidth: 3,
  presence: {},

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setFill: (fill) => set({ fill }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),

  setPresence: (users) => set({ presence: Object.fromEntries(users.map((u) => [u.socketId, u])) }),
  upsertPresence: (user) => set((s) => ({ presence: { ...s.presence, [user.socketId]: user } })),
  removePresenceBySocket: (socketId) =>
    set((s) => {
      const next = { ...s.presence };
      delete next[socketId];
      return { presence: next };
    }),
  removePresenceByUser: (userId) =>
    set((s) => ({
      presence: Object.fromEntries(
        Object.entries(s.presence).filter(([, u]) => u.userId !== userId),
      ),
    })),
  resetPresence: () => set({ presence: {} }),
}));
