import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@/api/http';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  createLLMModel,
  deleteLLMModel,
  listLLMModels,
  updateLLMModel,
  type LLMModel,
  type LLMModelCreateInput,
  type LLMModelUpdateInput,
} from '@/api/modules/llmEntities';

const LLM_MODELS_QUERY_KEY = ['llm', 'entities', 'models'] as const;

function resolveErrorMessage(error: unknown, fallback: string): string {
  const maybeApiError = error as ApiError;
  const payload = maybeApiError?.response?.data as { error?: unknown; message?: unknown } | undefined;
  const payloadMessage = payload?.error ?? payload?.message;
  if (typeof payloadMessage === 'string' && payloadMessage.trim()) return payloadMessage;
  if (maybeApiError?.message && typeof maybeApiError.message === 'string') return maybeApiError.message;
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  return fallback;
}

async function invalidateModels(qc: ReturnType<typeof useQueryClient>) {
  await qc.invalidateQueries({ queryKey: LLM_MODELS_QUERY_KEY });
}

export function useLLMModels() {
  return useQuery<LLMModel[], ApiError>({
    queryKey: LLM_MODELS_QUERY_KEY,
    queryFn: () => listLLMModels(),
    staleTime: 30_000,
  });
}

export function useCreateLLMModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LLMModelCreateInput) => createLLMModel(payload),
    onSuccess: async () => {
      notifySuccess('Model created');
      await invalidateModels(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to create model'));
    },
  });
}

export function useUpdateLLMModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LLMModelUpdateInput }) => updateLLMModel(id, payload),
    onSuccess: async () => {
      notifySuccess('Model updated');
      await invalidateModels(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to update model'));
    },
  });
}

export function useDeleteLLMModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLLMModel(id),
    onSuccess: async () => {
      notifySuccess('Model deleted');
      await invalidateModels(qc);
    },
    onError: (error: unknown) => {
      notifyError(resolveErrorMessage(error, 'Failed to delete model'));
    },
  });
}
