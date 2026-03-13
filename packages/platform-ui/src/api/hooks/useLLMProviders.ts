import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createLLMProvider,
  deleteLLMProvider,
  listLLMProviders,
  updateLLMProvider,
  type LLMProvider,
  type LLMProviderCreateInput,
  type LLMProviderUpdateInput,
} from '@/api/modules/llmEntities';

const LLM_PROVIDERS_QUERY_KEY = ['llm', 'entities', 'providers'] as const;

function resolveErrorMessage(error: unknown, fallback: string): string {
  const maybeApiError = error as ApiError;
  const payload = maybeApiError?.response?.data as { error?: unknown; message?: unknown } | undefined;
  const payloadMessage = payload?.error ?? payload?.message;
  if (typeof payloadMessage === 'string' && payloadMessage.trim()) return payloadMessage;
  if (maybeApiError?.message && typeof maybeApiError.message === 'string') return maybeApiError.message;
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  return fallback;
}

async function invalidateProviders(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({ queryKey: LLM_PROVIDERS_QUERY_KEY });
}

export function useLLMProviders() {
  return useQuery<LLMProvider[], ApiError>({
    queryKey: LLM_PROVIDERS_QUERY_KEY,
    queryFn: () => listLLMProviders(),
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
