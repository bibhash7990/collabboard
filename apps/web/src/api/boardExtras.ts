import { api } from '../lib/apiClient';
import type {
  ActionItem,
  GenerateActionItemsResponse,
  Invitation,
  PublicBoardResponse,
  ShareLink,
  Snapshot,
} from '@collabboard/shared';

export const snapshotsApi = {
  list: (boardId: string) =>
    api
      .get<{ snapshots: Snapshot[] }>(`/boards/${boardId}/snapshots`)
      .then((r) => r.data.snapshots),
  create: (boardId: string, label?: string) =>
    api.post<{ snapshotId: string }>(`/boards/${boardId}/snapshots`, { label }).then((r) => r.data),
  restore: (boardId: string, snapshotId: string) =>
    api.post(`/boards/${boardId}/snapshots/restore`, { snapshotId }).then(() => undefined),
};

export const aiApi = {
  actionItems: (boardId: string, text?: string) =>
    api
      .post<GenerateActionItemsResponse>(`/boards/${boardId}/ai/action-items`, { text })
      .then((r) => r.data),
};

export const shareApi = {
  list: (boardId: string) =>
    api.get<{ links: ShareLink[] }>(`/boards/${boardId}/share`).then((r) => r.data.links),
  create: (boardId: string, ttlDays?: number | null) =>
    api
      .post<{ link: ShareLink; url: string }>(`/boards/${boardId}/share`, { ttlDays })
      .then((r) => r.data),
  revoke: (boardId: string, linkId: string) =>
    api.delete(`/boards/${boardId}/share/${linkId}`).then(() => undefined),
  getPublic: (token: string) =>
    api.get<PublicBoardResponse>(`/public/boards/${token}`).then((r) => r.data),
};

export const exportApi = {
  /** Server-generated meeting-summary PDF (notes + optional embedded canvas PNG). */
  pdf: (boardId: string, canvasPng?: string, actionItems?: ActionItem[]) =>
    api
      .post(`/boards/${boardId}/export/pdf`, { canvasPng, actionItems }, { responseType: 'blob' })
      .then((r) => r.data as Blob),
};

export const invitationsApi = {
  preview: (token: string) =>
    api.get<{ invitation: Invitation }>(`/invitations/${token}`).then((r) => r.data.invitation),
  accept: (token: string) =>
    api
      .post<{ workspaceId: string | null; boardId: string | null }>('/invitations/accept', {
        token,
      })
      .then((r) => r.data),
};
