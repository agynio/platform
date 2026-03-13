import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractErrorCode } from '@/lib/extractErrorCode';
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
import { DEFAULT_PAGE_SIZE, normalizePageToken } from '@/lib/pagination';

const ENTITY_SECRETS_QUERY_KEY = ['entity-secrets'] as const;

function buildEntitySecretsQueryKey(params: { secretProviderId?: string; pageSize: number }) {
  const providerId = params.secretProviderId ?? null;
  return [...ENTITY_SECRETS_QUERY_KEY, providerId, params.pageSize] as const;
}

function invalidateEntitySecretsQuery(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: ENTITY_SECRETS_QUERY_KEY });
}

type EntitySecretsPageParam = string | undefined;
type EntitySecretsQueryKey = ReturnType<typeof buildEntitySecretsQueryKey>;
type EntitySecretsData = InfiniteData<PaginatedSecrets, EntitySecretsPageParam>;

export function useEntitySecrets(params: { secretProviderId?: string; pageSize?: number } = {}) {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery<PaginatedSecrets, Error, EntitySecretsData, EntitySecretsQueryKey, EntitySecretsPageParam>({
    queryKey: buildEntitySecretsQueryKey({ secretProviderId: params.secretProviderId, pageSize }),
    queryFn: ({ pageParam }) =>
      listEntitySecrets({ secretProviderId: params.secretProviderId, pageSize, pageToken: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => normalizePageToken(lastPage.nextPageToken),
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
