import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';
import { config } from '@/config';

export type ApiError = AxiosError<{ error?: string; message?: string } | unknown>;

function createHttp(baseURL: string): AxiosInstance {
  const inst = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    withCredentials: false,
  });

  // Response: unwrap data; error: normalize to AxiosError with server message if present
  inst.interceptors.response.use(
    (res) => res.data,
    (err) => {
      // Pass through AxiosError; ensure message surfaces server error string when available
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string; message?: string } | undefined;
        if (data?.error && !err.message.includes(data.error)) err.message = data.error;
        else if (data?.message && !err.message.includes(data.message)) err.message = data.message;
      }
      return Promise.reject(err);
    },
  );
  return inst;
}

export const http = createHttp(config.apiBaseUrl);
// Tracing API client: use base from config (defaults handled in config)
export const tracingHttp = createHttp(config.tracing.serverUrl as string);

// Helper to re-type axios promise (interceptor returns payload at runtime)
export function asData<T>(p: Promise<unknown>): Promise<T> {
  return p as Promise<T>;
}
