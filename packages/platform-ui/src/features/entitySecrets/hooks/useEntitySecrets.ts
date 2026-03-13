import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createEntitySecret,
  deleteEntitySecret,
  listEntitySecrets,
  resolveEntitySecret,
  updateEntitySecret,
  type PaginatedSecrets,
  type ResolvedSecretValue,
  type SecretCreateRequest,
  type SecretUpdateRequest,
} from '@/api/modules/entitySecrets';

const ENTITY_SECRETS_QUERY_KEY = ['entity-secrets'] as const;

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

function buildEntitySecretsQueryKey(params: { secretProviderId?: string; page?: number; perPage?: number }) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const providerId = params.secretProviderId ?? null;
  return [...ENTITY_SECRETS_QUERY_KEY, providerId, page, perPage] as const;
}

function invalidateEntitySecretsQuery(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: ENTITY_SECRETS_QUERY_KEY });
}

export function useEntitySecrets(params: { secretProviderId?: string; page?: number; perPage?: number } = {}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  return useQuery<PaginatedSecrets, Error>({
    queryKey: buildEntitySecretsQueryKey({ secretProviderId: params.secretProviderId, page, perPage }),
    queryFn: () => listEntitySecrets({ secretProviderId: params.secretProviderId, page, perPage }),
    staleTime: 30_000,
  });
}

export function useCreateEntitySecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SecretCreateRequest) => createEntitySecret(payload),
    onSuccess: async () => {
      notifySuccess('Secret created');
      await invalidateEntitySecretsQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Create failed');
    },
  });
}

export function useUpdateEntitySecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SecretUpdateRequest }) => updateEntitySecret(id, patch),
    onSuccess: async () => {
      notifySuccess('Secret updated');
      await invalidateEntitySecretsQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Update failed');
    },
  });
}

export function useDeleteEntitySecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEntitySecret(id),
    onSuccess: async () => {
      notifySuccess('Secret deleted');
      await invalidateEntitySecretsQuery(qc);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Delete failed');
    },
  });
}

export function useResolveEntitySecret() {
  return useMutation<ResolvedSecretValue, unknown, string>({
    mutationFn: (id: string) => resolveEntitySecret(id),
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      notifyError(code ?? 'Resolve failed');
    },
  });
}
