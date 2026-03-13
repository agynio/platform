import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { extractErrorCode } from '@/lib/extractErrorCode';
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
