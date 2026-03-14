import type { ApiError } from '@/api/http';

export function extractErrorCode(error: unknown): string | null {
  if (!error) return null;
  const maybeApiError = error as ApiError;
  const payload = maybeApiError.response?.data;
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string') {
      return errorValue;
    }
  }
  if (maybeApiError.message && typeof maybeApiError.message === 'string') {
    return maybeApiError.message;
  }
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}
