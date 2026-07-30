import { api } from '../lib/apiClient';
import type { AuthResponse, LoginRequest, Me, RegisterRequest } from '@collabboard/shared';

export const authApi = {
  register: (body: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register', body).then((r) => r.data),
  login: (body: LoginRequest) => api.post<AuthResponse>('/auth/login', body).then((r) => r.data),
  refresh: () => api.post<{ accessToken: string }>('/auth/refresh').then((r) => r.data),
  logout: () => api.post('/auth/logout').then(() => undefined),
  me: () => api.get<{ user: Me }>('/auth/me').then((r) => r.data.user),
  verifyEmail: (token: string) =>
    api.post<{ user: Me }>('/auth/verify-email', { token }).then((r) => r.data.user),
  resendVerification: () => api.post('/auth/resend-verification').then(() => undefined),
};
