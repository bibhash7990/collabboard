import { api } from '../lib/apiClient';
import type {
  Board,
  BoardMember,
  CreateBoardRequest,
  InviteRequest,
  Invitation,
  ListBoardsQuery,
  ListBoardsResponse,
  UpdateBoardRequest,
  UpdateMemberRoleRequest,
} from '@collabboard/shared';

export const boardsApi = {
  list: (query: ListBoardsQuery = {}) =>
    api.get<ListBoardsResponse>('/boards', { params: query }).then((r) => r.data),
  create: (body: CreateBoardRequest) =>
    api.post<{ board: Board }>('/boards', body).then((r) => r.data.board),
  get: (id: string) => api.get<{ board: Board }>(`/boards/${id}`).then((r) => r.data.board),
  update: (id: string, body: UpdateBoardRequest) =>
    api.patch<{ board: Board }>(`/boards/${id}`, body).then((r) => r.data.board),
  remove: (id: string) => api.delete(`/boards/${id}`).then(() => undefined),
  star: (id: string, starred: boolean) =>
    api.post<{ starred: boolean }>(`/boards/${id}/star`, { starred }).then((r) => r.data.starred),
  members: (id: string) =>
    api.get<{ members: BoardMember[] }>(`/boards/${id}/members`).then((r) => r.data.members),
  invite: (id: string, body: InviteRequest) =>
    api
      .post<{ invitation: Invitation }>(`/boards/${id}/invitations`, body)
      .then((r) => r.data.invitation),
  updateMemberRole: (id: string, body: UpdateMemberRoleRequest) =>
    api.patch<{ member: BoardMember }>(`/boards/${id}/members`, body).then((r) => r.data.member),
  removeMember: (id: string, userId: string) =>
    api.delete(`/boards/${id}/members/${userId}`).then(() => undefined),
};
