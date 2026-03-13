import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createSecretProvider,
  deleteSecretProvider,
  listSecretProviders,
  updateSecretProvider,
  type PaginatedSecretProviders,
  type SecretProviderCreateRequest,
  type SecretProviderUpdateRequest,
} from '@/api/modules/secretProviders';

const SECRET_PROVIDERS_QUERY_KEY = ['secret-providers'] as const;

function extractErrorCode(error: unknown): string | null {
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

function buildSecretProvidersQueryKey(params: { page?: number; perPage?: number }) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  return [...SECRET_PROVIDERS_QUERY_KEY, page, perPage] as const;
}

function invalidateSecretProvidersQuery(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: SECRET_PROVIDERS_QUERY_KEY });
}

export function useSecretProviders(params: { page?: number; perPage?: number } = {}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  return useQuery<PaginatedSecretProviders, Error>({
    queryKey: buildSecretProvidersQueryKey({ page, perPage }),
    queryFn: () => listSecretProviders({ page, perPage }),
    staleTime: 30_000,
  });
}

export function useCreateSecretProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SecretProviderCreateRequest) => createSecretProvider(payload),
    onSuccess: async () => {
      notifySuccess('Secret provider added');
      await invalidateSecretProvidersQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Create failed');
    },
  });
}

export function useUpdateSecretProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SecretProviderUpdateRequest }) => updateSecretProvider(id, patch),
    onSuccess: async () => {
      notifySuccess('Secret provider updated');
      await invalidateSecretProvidersQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Update failed');
    },
  });
}

export function useDeleteSecretProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSecretProvider(id),
    onSuccess: async () => {
      notifySuccess('Secret provider deleted');
      await invalidateSecretProvidersQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Delete failed');
    },
  });
}
