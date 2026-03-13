import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { resolveErrorMessage } from '@/api/errors';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createLLMProvider,
  deleteLLMProvider,
  getLLMProvider,
  listLLMProviders,
  updateLLMProvider,
  type LLMProvider,
  type LLMProviderCreateInput,
  type LLMProviderUpdateInput,
  type ListLLMProvidersParams,
  type PaginatedResponse,
} from '@/api/modules/llmEntities';

const LLM_PROVIDERS_QUERY_KEY = ['llm', 'entities', 'providers'] as const;

async function invalidateProviders(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({ queryKey: LLM_PROVIDERS_QUERY_KEY });
}

export function useLLMProviders(params: ListLLMProvidersParams = {}) {
  return useQuery<PaginatedResponse<LLMProvider>, ApiError>({
    queryKey: [...LLM_PROVIDERS_QUERY_KEY, params],
    queryFn: () => listLLMProviders(params),
    staleTime: 30_000,
  });
}

export function useLLMProvider(id: string | null) {
  return useQuery<LLMProvider, ApiError>({
    queryKey: [...LLM_PROVIDERS_QUERY_KEY, id],
    queryFn: () => getLLMProvider(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useCreateLLMProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LLMProviderCreateInput) => createLLMProvider(payload),
    onSuccess: async () => {
      notifySuccess('Provider created');
      await invalidateProviders(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to create provider'));
    },
  });
}

export function useUpdateLLMProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LLMProviderUpdateInput }) => updateLLMProvider(id, payload),
    onSuccess: async () => {
      notifySuccess('Provider updated');
      await invalidateProviders(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to update provider'));
    },
  });
}

export function useDeleteLLMProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLLMProvider(id),
    onSuccess: async () => {
      notifySuccess('Provider deleted');
      await invalidateProviders(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to delete provider'));
    },
  });
}
