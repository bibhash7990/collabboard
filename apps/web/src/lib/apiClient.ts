import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError, RefreshResponse } from '@collabboard/shared';
import { APP_ENV } from './env';
import { getAccessToken, useAuthStore } from '../stores/authStore';

/**
 * Axios instance with:
 *   - Bearer access token from the in-memory auth store on every request.
 *   - A single-flight refresh on 401 (httpOnly refresh cookie), then one retry.
 *   - Normalized `ApiError` rejection shape for callers.
 */
export const api: AxiosInstance = axios.create({
  baseURL: `${APP_ENV.API_URL}/api`,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<RefreshResponse>(`${APP_ENV.API_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data.accessToken;
        useAuthStore.getState().setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const isAuthRoute = original?.url?.includes('/auth/');

    if (status === 401 && !original._retry && !isAuthRoute && code !== 'UNAUTHORIZED_FINAL') {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clear();
      }
    }
    return Promise.reject(normalizeError(error));
  },
);

export interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
}

export function normalizeError(error: unknown): NormalizedError {
  if (axios.isAxiosError(error)) {
    const body = (error.response?.data as ApiError | undefined)?.error;
    return {
      status: error.response?.status ?? 0,
      code: body?.code ?? 'NETWORK_ERROR',
      message: body?.message ?? error.message ?? 'Network error',
      details: body?.details,
    };
  }
  return { status: 0, code: 'UNKNOWN', message: 'Unexpected error' };
}
