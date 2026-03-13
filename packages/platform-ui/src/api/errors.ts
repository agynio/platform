import type { ApiError } from '@/api/http';

export function resolveErrorMessage(error: unknown, fallback: string): string {
  const maybeApiError = error as ApiError;
  const payload = maybeApiError?.response?.data as { error?: unknown; message?: unknown } | undefined;
  const payloadMessage = payload?.error ?? payload?.message;
  if (typeof payloadMessage === 'string' && payloadMessage.trim()) return payloadMessage;
  if (maybeApiError?.message && typeof maybeApiError.message === 'string') return maybeApiError.message;
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  return fallback;
}
