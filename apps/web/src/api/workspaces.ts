import { api } from '../lib/apiClient';
import type {
  CreateWorkspaceRequest,
  InviteRequest,
  Invitation,
  UpdateMemberRoleRequest,
  UpdateWorkspaceRequest,
  Workspace,
  WorkspaceMember,
} from '@collabboard/shared';

export const workspacesApi = {
  list: () => api.get<{ workspaces: Workspace[] }>('/workspaces').then((r) => r.data.workspaces),
  create: (body: CreateWorkspaceRequest) =>
    api.post<{ workspace: Workspace }>('/workspaces', body).then((r) => r.data.workspace),
  get: (id: string) =>
    api.get<{ workspace: Workspace }>(`/workspaces/${id}`).then((r) => r.data.workspace),
  update: (id: string, body: UpdateWorkspaceRequest) =>
    api.patch<{ workspace: Workspace }>(`/workspaces/${id}`, body).then((r) => r.data.workspace),
  remove: (id: string) => api.delete(`/workspaces/${id}`).then(() => undefined),
  members: (id: string) =>
    api
      .get<{ members: WorkspaceMember[] }>(`/workspaces/${id}/members`)
      .then((r) => r.data.members),
  invite: (id: string, body: InviteRequest) =>
    api
      .post<{ invitation: Invitation }>(`/workspaces/${id}/invitations`, body)
      .then((r) => r.data.invitation),
  updateMemberRole: (id: string, body: UpdateMemberRoleRequest) =>
    api
      .patch<{ member: WorkspaceMember }>(`/workspaces/${id}/members`, body)
      .then((r) => r.data.member),
  removeMember: (id: string, userId: string) =>
    api.delete(`/workspaces/${id}/members/${userId}`).then(() => undefined),
};
