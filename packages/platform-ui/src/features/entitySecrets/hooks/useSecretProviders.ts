import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { DEFAULT_PAGE_SIZE, normalizePageToken } from '@/lib/pagination';

const SECRET_PROVIDERS_QUERY_KEY = ['secret-providers'] as const;

function buildSecretProvidersQueryKey(pageSize: number) {
  return [...SECRET_PROVIDERS_QUERY_KEY, pageSize] as const;
}

function invalidateSecretProvidersQuery(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: SECRET_PROVIDERS_QUERY_KEY });
}

type SecretProviderPageParam = string | undefined;
type SecretProviderQueryKey = ReturnType<typeof buildSecretProvidersQueryKey>;
type SecretProvidersData = InfiniteData<PaginatedSecretProviders, SecretProviderPageParam>;

export function useSecretProviders(params: { pageSize?: number } = {}) {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery<PaginatedSecretProviders, Error, SecretProvidersData, SecretProviderQueryKey, SecretProviderPageParam>({
    queryKey: buildSecretProvidersQueryKey(pageSize),
    queryFn: ({ pageParam }) => listSecretProviders({ pageSize, pageToken: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => normalizePageToken(lastPage.nextPageToken),
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
